import { GoogleGenAI, Type, Schema } from "@google/genai";
import { AnalysisResult } from "../types";

// Initialize Gemini Client
const getAiClient = () => new GoogleGenAI({ apiKey: process.env.API_KEY });

const INLINE_SIZE_LIMIT = 10 * 1024 * 1024; // 10 MB

// Define the response schema for structured output
const analysisSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    title: {
      type: Type.STRING,
      description: "A catchy title for the viral video analysis.",
    },
    summary: {
      type: Type.STRING,
      description: "A brief summary of the video's content, style, and viral hook.",
    },
    scenes: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.INTEGER },
          timeRange: { type: Type.STRING, description: "e.g., 00:00 - 00:05" },
          visualDescription: { type: Type.STRING, description: "Detailed visual description of the scene." },
          cameraMovement: { type: Type.STRING, description: "Camera angle, movement, and lens choice." },
          aiImagePrompt: { type: Type.STRING, description: "Prompt for AI Image generator (Midjourney/Flux). Include style, lighting, composition." },
          aiVideoPrompt: { type: Type.STRING, description: "Prompt for AI Video generator (Runway/Luma/Veo). Focus on motion and physics." },
          voiceoverScript: { type: Type.STRING, description: "The spoken script or text overlay for this segment." },
        },
        required: ["id", "timeRange", "visualDescription", "cameraMovement", "aiImagePrompt", "aiVideoPrompt"],
      },
    },
  },
  required: ["title", "summary", "scenes"],
};

// --- Helper Functions for File Upload ---

/**
 * Uploads a file to the Gemini File API using resumable upload protocol.
 * We implement this manually via fetch to work reliably in browser environments without Node streams.
 */
async function uploadFileToGemini(file: File): Promise<string> {
  const apiKey = process.env.API_KEY;
  const uploadUrl = `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`;
  const mimeType = file.type || 'application/octet-stream';
  const fileSize = file.size.toString();

  console.log(`Starting upload: ${file.name} (${file.size} bytes, ${mimeType})`);

  // 1. Initial Resumable Request
  // We strictly define the headers to match the subsequent body
  const startResponse = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': fileSize,
      'X-Goog-Upload-Header-Content-Type': mimeType,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ file: { display_name: file.name } }),
  });

  if (!startResponse.ok) {
    const errText = await startResponse.text();
    throw new Error(`Failed to initiate upload: ${startResponse.status} ${startResponse.statusText} - ${errText}`);
  }

  let actualUploadUrl = startResponse.headers.get('x-goog-upload-url');
  if (!actualUploadUrl) {
    throw new Error("No upload URL returned from Gemini API");
  }

  // Ensure the upload URL has the key if it's missing (rare but possible cause of 404s)
  if (!actualUploadUrl.includes('key=') && apiKey) {
    actualUploadUrl += actualUploadUrl.includes('?') ? `&key=${apiKey}` : `?key=${apiKey}`;
  }

  console.log("Upload URL obtained, starting transfer...");

  // 2. Upload actual bytes
  // Create a Blob with the specific type we promised in the handshake. 
  // This ensures the browser sends the correct Content-Type header automatically.
  const fileBlob = new Blob([file], { type: mimeType });

  const uploadResponse = await fetch(actualUploadUrl, {
    method: 'PUT',
    headers: {
      // Do NOT set Content-Type manually here. 
      // Fetch will automatically use the Blob's type, preventing mismatches.
      'Content-Length': fileSize, 
      'X-Goog-Upload-Offset': '0',
      'X-Goog-Upload-Command': 'upload, finalize',
    },
    body: fileBlob, 
  });

  if (!uploadResponse.ok) {
    const errText = await uploadResponse.text();
    console.error(`Upload failed details: ${errText}`);
    throw new Error(`Failed to upload file bytes: ${uploadResponse.status} ${uploadResponse.statusText} - ${errText}`);
  }

  const uploadResult = await uploadResponse.json();
  console.log("Upload successful:", uploadResult);
  return uploadResult.file.uri;
}

/**
 * Polls the file status until it is ACTIVE or fails.
 */
async function waitForFileActive(fileUri: string): Promise<void> {
  const apiKey = process.env.API_KEY;
  
  // Robust extraction: handle both full URI and short name
  let fileName = fileUri;
  if (fileUri.startsWith('https://')) {
      const parts = fileUri.split('/files/');
      if (parts.length > 1) {
          fileName = 'files/' + parts[1];
      }
  }

  // If we just have the raw name (e.g. 'abc-123'), prepend 'files/'
  if (!fileName.startsWith('files/') && !fileName.startsWith('https')) {
      fileName = `files/${fileName}`;
  }

  // If it's a full URL, we can likely just use it if we append the key
  let getUrl;
  if (fileName.startsWith('https://')) {
       getUrl = `${fileName}?key=${apiKey}`;
  } else {
       getUrl = `https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${apiKey}`;
  }

  console.log("Polling file status:", fileName);

  while (true) {
    const response = await fetch(getUrl);
    if (!response.ok) {
        const err = await response.text();
        throw new Error(`Failed to check file status: ${err}`);
    }
    
    const data = await response.json();
    const state = data.state;
    console.log(`File state: ${state}`);

    if (state === "ACTIVE") {
      return;
    } else if (state === "FAILED") {
      throw new Error("Video processing failed on Gemini servers.");
    }

    // Wait 5 seconds before next poll
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
}

/**
 * Converts file to base64 string
 */
const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(',')[1]);
    };
    reader.onerror = error => reject(error);
  });
};

// --- Main Analysis Service ---

export const analyzeVideoScript = async (file: File): Promise<AnalysisResult> => {
  try {
    const ai = getAiClient();
    const model = 'gemini-2.5-flash';
    let parts: any[] = [];

    // Logic Branching based on file size
    if (file.size < INLINE_SIZE_LIMIT) {
      // SMALL FILE: Use Inline Data (Faster, no upload delay)
      const base64Data = await fileToBase64(file);
      parts = [
        {
          inlineData: {
            mimeType: file.type || 'video/mp4',
            data: base64Data,
          },
        }
      ];
    } else {
      // LARGE FILE: Use File API (Upload -> Poll -> Generate)
      console.log("File > 10MB detected. Initiating Resumable Upload...");
      const fileUri = await uploadFileToGemini(file);
      console.log("File uploaded. URI:", fileUri);
      
      console.log("Waiting for file processing to complete...");
      await waitForFileActive(fileUri);
      console.log("File is ACTIVE.");

      parts = [
        {
          fileData: {
            mimeType: file.type || 'video/mp4',
            fileUri: fileUri
          }
        }
      ];
    }

    // Append the prompt to parts
    parts.push({
      text: `
      You are an expert video director and AI content strategist. 
      Analyze the uploaded video file to reverse-engineer its success formula.
      
      Break down the video into key storyboard scenes. For each scene, provide:
      1. A precise visual description.
      2. Camera movement analysis.
      3. A high-quality AI Image Generation prompt (optimized for photorealism or the specific style of the video).
      4. A high-quality AI Video Generation prompt (optimized for motion dynamics).
      5. Any voiceover or text overlay script present.
      
      Return the result in JSON format matching the schema provided.
      `,
    });

    const response = await ai.models.generateContent({
      model: model,
      contents: { parts },
      config: {
        responseMimeType: "application/json",
        responseSchema: analysisSchema,
        temperature: 0.4,
      },
    });

    const text = response.text;
    if (!text) {
      throw new Error("No response text received from Gemini.");
    }

    const result = JSON.parse(text) as AnalysisResult;
    return result;

  } catch (error: any) {
    console.error("Gemini Analysis Error:", error);
    
    // Check for specific RPC/XHR errors related to payload size (fallback check)
    const errorMessage = error.message || "";
    if (errorMessage.includes("Rpc failed") || errorMessage.includes("xhr error") || errorMessage.includes("code: 6")) {
      throw new Error("Network error during analysis. If the file is large, please ensure your internet connection is stable or try a smaller clip.");
    }

    throw error;
  }
};

export const generateVeoVideo = async (
  prompt: string,
  imageBase64: string | undefined,
  aspectRatio: '16:9' | '9:16'
): Promise<string> => {
  const ai = getAiClient();
  const model = 'veo-3.1-fast-generate-preview';

  try {
    // Construct the request
    let operation;
    
    if (imageBase64) {
      operation = await ai.models.generateVideos({
        model,
        prompt: prompt,
        image: {
          imageBytes: imageBase64,
          mimeType: 'image/png', // Assuming PNG or standard image format, the API is flexible but mimeType is required
        },
        config: {
          numberOfVideos: 1,
          resolution: '720p', // veo-3.1-fast supports 720p well
          aspectRatio: aspectRatio,
        }
      });
    } else {
      operation = await ai.models.generateVideos({
        model,
        prompt: prompt,
        config: {
          numberOfVideos: 1,
          resolution: '720p',
          aspectRatio: aspectRatio,
        }
      });
    }

    // Polling loop
    console.log("Veo generation started...", operation);
    while (!operation.done) {
      await new Promise(resolve => setTimeout(resolve, 5000)); // Poll every 5s
      operation = await ai.operations.getVideosOperation({ operation: operation });
      console.log("Veo polling status:", operation.metadata?.state);
    }

    if (operation.error) {
      throw new Error(`Veo generation failed: ${operation.error.message}`);
    }

    const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
    if (!downloadLink) {
      throw new Error("No video URI returned from Veo.");
    }

    // Fetch the actual video bytes using the API key
    // We must append the key manually as per instructions
    const videoResponse = await fetch(`${downloadLink}&key=${process.env.API_KEY}`);
    if (!videoResponse.ok) {
      throw new Error(`Failed to download generated video: ${videoResponse.statusText}`);
    }

    const videoBlob = await videoResponse.blob();
    return URL.createObjectURL(videoBlob);

  } catch (error) {
    console.error("Veo Generation Error:", error);
    throw error;
  }
};