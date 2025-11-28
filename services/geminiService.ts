import { GoogleGenAI, Type, Schema } from "@google/genai";
import { AnalysisResult } from "../types";

// Initialize Gemini Client
// We create a function to get the client to ensure we pick up the latest key if it changes
const getAiClient = () => new GoogleGenAI({ apiKey: process.env.API_KEY });

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

export const analyzeVideoScript = async (base64Data: string, mimeType: string): Promise<AnalysisResult> => {
  try {
    const ai = getAiClient();
    const model = 'gemini-2.5-flash';

    const response = await ai.models.generateContent({
      model: model,
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: mimeType,
              data: base64Data,
            },
          },
          {
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
          },
        ],
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: analysisSchema,
        temperature: 0.4, // Lower temperature for more analytical accuracy
      },
    });

    const text = response.text;
    if (!text) {
      throw new Error("No response text received from Gemini.");
    }

    const result = JSON.parse(text) as AnalysisResult;
    return result;

  } catch (error) {
    console.error("Gemini Analysis Error:", error);
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