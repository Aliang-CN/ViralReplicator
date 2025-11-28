import React, { useState, useRef, useEffect } from 'react';
import { AnalysisResult, StoryboardScene } from '../types';
import { Copy, Check, Video, Image as ImageIcon, Clapperboard, Film, Sparkles, Upload, Loader2, AlertCircle, Layers, PlayCircle, Download, Edit2, Save, X } from 'lucide-react';
import { generateVeoVideo } from '../services/geminiService';

interface AnalysisResultViewProps {
  result: AnalysisResult;
  videoUrl: string;
}

export const AnalysisResultView: React.FC<AnalysisResultViewProps> = ({ result, videoUrl }) => {
  // Local state to manage edits to the analysis result
  const [localResult, setLocalResult] = useState<AnalysisResult>(result);
  
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [generatedVideos, setGeneratedVideos] = useState<Record<number, string>>({});
  const [isMerging, setIsMerging] = useState(false);
  const [mergedVideoUrl, setMergedVideoUrl] = useState<string | null>(null);
  const [mergeProgress, setMergeProgress] = useState<string>("");

  // Sync state if prop changes (e.g. re-analysis)
  useEffect(() => {
    setLocalResult(result);
  }, [result]);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleVideoGenerated = (sceneId: number, url: string) => {
    setGeneratedVideos(prev => ({
      ...prev,
      [sceneId]: url
    }));
  };

  const handleSceneUpdate = (updatedScene: StoryboardScene) => {
    setLocalResult(prev => ({
      ...prev,
      scenes: prev.scenes.map(s => s.id === updatedScene.id ? updatedScene : s)
    }));
  };

  const handleMergeVideos = async () => {
    // Filter and sort videos by scene ID to ensure correct order
    const orderedScenes = localResult.scenes.sort((a, b) => a.id - b.id);
    const videoUrlsToMerge = orderedScenes
      .map(scene => generatedVideos[scene.id])
      .filter(url => !!url);

    if (videoUrlsToMerge.length === 0) return;

    setIsMerging(true);
    setMergedVideoUrl(null);
    setMergeProgress("Initializing studio...");

    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const videoPlayer = document.createElement('video');
      videoPlayer.crossOrigin = "anonymous";
      videoPlayer.muted = true; // Required for auto-play in some contexts, we handle audio separately if needed or via captureStream

      if (!ctx) throw new Error("Could not create canvas context");

      // Setup Media Recorder
      // We need to wait for the first video to set dimensions
      
      const stream = canvas.captureStream(30); // 30 FPS
      const chunks: Blob[] = [];
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9' });
      
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      mediaRecorder.start();

      for (let i = 0; i < videoUrlsToMerge.length; i++) {
        const url = videoUrlsToMerge[i];
        setMergeProgress(`Processing scene ${i + 1} of ${videoUrlsToMerge.length}...`);

        await new Promise<void>((resolve, reject) => {
          videoPlayer.src = url;
          
          videoPlayer.onloadedmetadata = () => {
            // Set canvas size to match the first video (assuming consistent aspect ratio)
            if (i === 0) {
              canvas.width = videoPlayer.videoWidth;
              canvas.height = videoPlayer.videoHeight;
            }
          };

          videoPlayer.onended = () => {
            resolve();
          };

          videoPlayer.onerror = (e) => {
            console.error("Error playing video segment", e);
            resolve(); // Skip on error to keep going
          };

          videoPlayer.play().then(() => {
            const drawFrame = () => {
              if (videoPlayer.paused || videoPlayer.ended) return;
              ctx.drawImage(videoPlayer, 0, 0, canvas.width, canvas.height);
              requestAnimationFrame(drawFrame);
            };
            drawFrame();
          }).catch(e => {
             console.error("Play failed", e);
             resolve();
          });
        });
      }

      mediaRecorder.stop();
      
      await new Promise<void>(resolve => {
        mediaRecorder.onstop = () => resolve();
      });

      const blob = new Blob(chunks, { type: 'video/webm' });
      const finalUrl = URL.createObjectURL(blob);
      setMergedVideoUrl(finalUrl);

    } catch (error) {
      console.error("Merge failed", error);
      alert("Failed to merge videos. Please check console for details.");
    } finally {
      setIsMerging(false);
      setMergeProgress("");
    }
  };

  const readySceneCount = Object.keys(generatedVideos).length;
  const totalSceneCount = localResult.scenes.length;
  const allReady = readySceneCount > 0 && readySceneCount === totalSceneCount;

  return (
    <div className="w-full animate-in fade-in slide-in-from-bottom-8 duration-700 pb-20">
      
      {/* Header Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-12">
        {/* Video Preview */}
        <div className="lg:col-span-1">
            <div className="relative rounded-xl overflow-hidden shadow-2xl border border-gray-700 bg-black">
                <video src={videoUrl} controls className="w-full aspect-video object-contain" />
                <div className="absolute top-2 left-2 bg-black/70 px-2 py-1 rounded text-xs text-white font-mono">Reference</div>
            </div>
        </div>

        {/* Meta Info */}
        <div className="lg:col-span-2 flex flex-col justify-center space-y-4">
            <h2 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-brand-neon to-brand-500">
                {localResult.title}
            </h2>
            <p className="text-gray-300 leading-relaxed bg-dark-card p-4 rounded-lg border border-gray-700/50">
                {localResult.summary}
            </p>
            <div className="flex gap-4">
                <div className="flex items-center gap-2 text-sm text-gray-400">
                    <Clapperboard className="w-4 h-4 text-brand-500" />
                    <span>{localResult.scenes.length} Scenes Detected</span>
                </div>
            </div>
        </div>
      </div>

      <div className="border-t border-gray-700 my-8"></div>

      <div className="mb-6 flex items-center justify-between">
          <h3 className="text-xl font-semibold text-white flex items-center gap-2">
            <span className="w-2 h-8 bg-brand-neon rounded-full"></span>
            Replication Workflow (Storyboard)
          </h3>
      </div>

      {/* Scenes List */}
      <div className="space-y-6 mb-16">
        {localResult.scenes.map((scene, index) => (
          <SceneCard 
            key={scene.id} // Use ID as key to prevent issues if array reorders, though here we just map
            scene={scene} 
            onCopy={copyToClipboard} 
            copiedId={copiedId} 
            onVideoSuccess={(url) => handleVideoGenerated(scene.id, url)}
            onUpdate={handleSceneUpdate}
          />
        ))}
      </div>

      {/* Final Assembly Section */}
      <div className="border-t border-gray-700 pt-10">
        <div className="bg-gradient-to-br from-gray-900 to-black border border-gray-700 rounded-2xl p-8 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 p-32 bg-brand-600/10 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>
            
            <div className="flex items-center gap-3 mb-6 relative z-10">
                <Layers className="w-8 h-8 text-brand-neon" />
                <h3 className="text-2xl font-bold text-white">Final Assembly</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 relative z-10">
                <div className="space-y-6">
                    <p className="text-gray-400">
                        Merge all your generated scene videos into a final cut. 
                        Ensure you have generated videos for the scenes you want to include.
                    </p>
                    
                    {/* Progress Checklist */}
                    <div className="bg-dark-bg/50 rounded-lg p-4 border border-gray-800 max-h-60 overflow-y-auto">
                        <h4 className="text-sm font-semibold text-gray-300 mb-3 uppercase tracking-wider">Scene Status</h4>
                        <div className="space-y-2">
                            {localResult.scenes.map(scene => (
                                <div key={scene.id} className="flex items-center justify-between text-sm">
                                    <span className="text-gray-400">Scene {scene.id}</span>
                                    {generatedVideos[scene.id] ? (
                                        <span className="flex items-center gap-1 text-green-400">
                                            <Check className="w-3 h-3" /> Ready
                                        </span>
                                    ) : (
                                        <span className="flex items-center gap-1 text-gray-600">
                                            <div className="w-2 h-2 rounded-full bg-gray-700"></div> Pending
                                        </span>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    <button
                        onClick={handleMergeVideos}
                        disabled={readySceneCount === 0 || isMerging}
                        className={`
                            w-full py-4 rounded-xl font-bold text-lg shadow-lg flex items-center justify-center gap-2 transition-all
                            ${readySceneCount > 0 && !isMerging
                                ? 'bg-brand-600 hover:bg-brand-500 text-white hover:scale-[1.02] shadow-brand-900/50' 
                                : 'bg-gray-800 text-gray-500 cursor-not-allowed'}
                        `}
                    >
                        {isMerging ? (
                            <>
                                <Loader2 className="w-5 h-5 animate-spin" />
                                {mergeProgress}
                            </>
                        ) : (
                            <>
                                <PlayCircle className="w-6 h-6" />
                                Merge {readySceneCount} Scenes into Video
                            </>
                        )}
                    </button>
                    {!allReady && readySceneCount > 0 && (
                        <p className="text-xs text-yellow-500/80 text-center">
                            Note: Some scenes are missing. The video will be created with available scenes only.
                        </p>
                    )}
                </div>

                {/* Final Video Output */}
                <div className="flex items-center justify-center bg-black/50 rounded-xl border border-gray-800 min-h-[300px]">
                    {mergedVideoUrl ? (
                         <div className="w-full h-full flex flex-col">
                            <video 
                                src={mergedVideoUrl} 
                                controls 
                                className="w-full h-auto max-h-[400px] rounded-t-xl" 
                            />
                            <div className="p-4 bg-dark-card rounded-b-xl border-t border-gray-700 flex justify-between items-center">
                                <span className="text-white font-medium">Final_Cut.webm</span>
                                <a 
                                    href={mergedVideoUrl} 
                                    download={`${localResult.title.replace(/\s+/g, '_')}_Final.webm`}
                                    className="flex items-center gap-2 bg-brand-600 hover:bg-brand-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                                >
                                    <Download className="w-4 h-4" /> Download
                                </a>
                            </div>
                        </div>
                    ) : (
                        <div className="text-center text-gray-500">
                            <Film className="w-12 h-12 mx-auto mb-2 opacity-50" />
                            <p>Merged video will appear here</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};

const SceneCard: React.FC<{
  scene: StoryboardScene;
  onCopy: (text: string, id: string) => void;
  copiedId: string | null;
  onVideoSuccess: (url: string) => void;
  onUpdate: (updatedScene: StoryboardScene) => void;
}> = ({ scene, onCopy, copiedId, onVideoSuccess, onUpdate }) => {
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [aspectRatio, setAspectRatio] = useState<'16:9'|'9:16'>('16:9');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedVideoUrl, setGeneratedVideoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingMsg, setLoadingMsg] = useState("Initializing...");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Edit Mode State
  const [isEditing, setIsEditing] = useState(false);
  const [editedData, setEditedData] = useState<StoryboardScene>(scene);

  useEffect(() => {
    setEditedData(scene);
  }, [scene]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      setUploadedImage(ev.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleGenerateVideo = async () => {
    if (window.aistudio) {
      const hasKey = await window.aistudio.hasSelectedApiKey();
      if (!hasKey) {
        try {
          await window.aistudio.openSelectKey();
        } catch (err) {
          setError("API Key selection failed or was cancelled.");
          return;
        }
      }
    }

    setIsGenerating(true);
    setError(null);
    setGeneratedVideoUrl(null);
    setLoadingMsg("Sending to Veo...");

    const msgs = [
      "Veo is dreaming up your video...",
      "Calculating physics and light...",
      "Rendering frames...",
      "Almost there...",
      "Polishing pixels..."
    ];
    let msgIdx = 0;
    const interval = setInterval(() => {
      setLoadingMsg(msgs[msgIdx % msgs.length]);
      msgIdx++;
    }, 4000);

    try {
        const imageBytes = uploadedImage ? uploadedImage.split(',')[1] : undefined;
        // Use the latest edited data for generation if available, though generation uses what's saved.
        // If the user edits but doesn't save, we should use the `scene` prop. 
        // If they saved, `scene` prop is updated.
        const videoUrl = await generateVeoVideo(scene.aiVideoPrompt, imageBytes, aspectRatio);
        setGeneratedVideoUrl(videoUrl);
        onVideoSuccess(videoUrl);
    } catch (err: any) {
        console.error(err);
        setError(err.message || "Failed to generate video");
    } finally {
        clearInterval(interval);
        setIsGenerating(false);
    }
  };

  const handleSaveEdit = () => {
    onUpdate(editedData);
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setEditedData(scene);
    setIsEditing(false);
  };

  return (
    <div className={`bg-dark-card border rounded-xl p-6 transition-colors duration-300 group relative ${isEditing ? 'border-brand-500 shadow-brand-900/20 shadow-lg' : 'border-gray-700 hover:border-brand-500'}`}>
      
      {/* Edit Controls */}
      <div className="absolute top-4 right-4 z-10 flex gap-2">
        {isEditing ? (
            <>
                <button onClick={handleSaveEdit} className="p-2 bg-green-600/20 hover:bg-green-600/40 text-green-400 rounded-lg transition-colors" title="Save Changes">
                    <Save className="w-4 h-4" />
                </button>
                <button onClick={handleCancelEdit} className="p-2 bg-red-600/20 hover:bg-red-600/40 text-red-400 rounded-lg transition-colors" title="Cancel">
                    <X className="w-4 h-4" />
                </button>
            </>
        ) : (
            <button onClick={() => setIsEditing(true)} className="p-2 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white rounded-lg transition-colors opacity-0 group-hover:opacity-100" title="Edit Scene">
                <Edit2 className="w-4 h-4" />
            </button>
        )}
      </div>

      <div className="flex flex-col md:flex-row gap-6">
        
        {/* Scene Info */}
        <div className="md:w-1/4 flex flex-col space-y-4 border-r border-gray-700/50 pr-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="bg-brand-900/60 text-brand-neon px-2 py-1 rounded text-xs font-mono border border-brand-500/30">
              SCENE {scene.id}
            </span>
            <span className="text-gray-400 text-xs font-mono">{scene.timeRange}</span>
          </div>
          
          <div>
            <h4 className="text-sm font-semibold text-gray-200 mb-1">Visual Action</h4>
            {isEditing ? (
                <textarea 
                    className="w-full bg-black/50 border border-gray-600 rounded p-2 text-sm text-gray-200 focus:border-brand-500 outline-none"
                    rows={4}
                    value={editedData.visualDescription}
                    onChange={e => setEditedData({...editedData, visualDescription: e.target.value})}
                />
            ) : (
                <p className="text-sm text-gray-400 leading-snug">{scene.visualDescription}</p>
            )}
          </div>
          
          <div>
            <h4 className="text-sm font-semibold text-gray-200 mb-1">Camera</h4>
            {isEditing ? (
                <input 
                    className="w-full bg-black/50 border border-gray-600 rounded p-2 text-sm text-gray-200 focus:border-brand-500 outline-none"
                    value={editedData.cameraMovement}
                    onChange={e => setEditedData({...editedData, cameraMovement: e.target.value})}
                />
            ) : (
                <p className="text-sm text-gray-400 leading-snug">{scene.cameraMovement}</p>
            )}
          </div>

          {(scene.voiceoverScript || isEditing) && (
             <div>
                <h4 className="text-sm font-semibold text-gray-200 mb-1">Script</h4>
                {isEditing ? (
                    <textarea 
                        className="w-full bg-black/50 border border-gray-600 rounded p-2 text-sm text-gray-200 focus:border-brand-500 outline-none"
                        rows={2}
                        value={editedData.voiceoverScript || ''}
                        onChange={e => setEditedData({...editedData, voiceoverScript: e.target.value})}
                        placeholder="Voiceover script..."
                    />
                ) : (
                    <p className="text-sm text-gray-400 italic">"{scene.voiceoverScript}"</p>
                )}
             </div>
          )}
        </div>

        {/* Prompts Section */}
        <div className="md:w-3/4 flex flex-col gap-4">
            
            {/* Image Prompt */}
            <div className={`bg-black/30 p-4 rounded-lg border relative transition-colors ${isEditing ? 'border-brand-500/50' : 'border-gray-800 group-hover:border-gray-600'}`}>
                <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-2 text-purple-400">
                        <ImageIcon className="w-4 h-4" />
                        <span className="text-xs font-bold uppercase tracking-wider">Midjourney / Flux Prompt</span>
                    </div>
                    {!isEditing && (
                        <button 
                            onClick={() => onCopy(scene.aiImagePrompt, `img-${scene.id}`)}
                            className="text-gray-500 hover:text-white transition-colors"
                            title="Copy Prompt"
                        >
                            {copiedId === `img-${scene.id}` ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                        </button>
                    )}
                </div>
                {isEditing ? (
                    <textarea 
                        className="w-full bg-black/50 border border-gray-600 rounded p-2 text-sm text-gray-300 font-mono focus:border-brand-500 outline-none"
                        rows={3}
                        value={editedData.aiImagePrompt}
                        onChange={e => setEditedData({...editedData, aiImagePrompt: e.target.value})}
                    />
                ) : (
                    <p className="text-sm text-gray-300 font-mono break-words">{scene.aiImagePrompt}</p>
                )}
            </div>

            {/* Video Prompt */}
            <div className={`bg-black/30 p-4 rounded-lg border relative transition-colors ${isEditing ? 'border-brand-500/50' : 'border-gray-800 group-hover:border-gray-600'}`}>
                <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-2 text-orange-400">
                        <Video className="w-4 h-4" />
                        <span className="text-xs font-bold uppercase tracking-wider">Runway / Luma / Veo Prompt</span>
                    </div>
                    {!isEditing && (
                        <button 
                            onClick={() => onCopy(scene.aiVideoPrompt, `vid-${scene.id}`)}
                            className="text-gray-500 hover:text-white transition-colors"
                            title="Copy Prompt"
                        >
                            {copiedId === `vid-${scene.id}` ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                        </button>
                    )}
                </div>
                 {isEditing ? (
                    <textarea 
                        className="w-full bg-black/50 border border-gray-600 rounded p-2 text-sm text-gray-300 font-mono focus:border-brand-500 outline-none"
                        rows={3}
                        value={editedData.aiVideoPrompt}
                        onChange={e => setEditedData({...editedData, aiVideoPrompt: e.target.value})}
                    />
                ) : (
                    <p className="text-sm text-gray-300 font-mono break-words">{scene.aiVideoPrompt}</p>
                )}
            </div>

            {/* Veo Generation Section */}
            {!isEditing && (
                <div className="mt-2 border border-brand-900/50 bg-brand-900/10 rounded-xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="px-4 py-3 bg-brand-900/20 border-b border-brand-900/30 flex items-center justify-between">
                        <div className="flex items-center gap-2 text-brand-neon">
                            <Film className="w-4 h-4" />
                            <span className="font-semibold text-sm">Veo Studio</span>
                            <span className="text-xs bg-brand-500/20 text-brand-300 px-2 py-0.5 rounded-full">Preview</span>
                        </div>
                    </div>
                    
                    <div className="p-4">
                        {!generatedVideoUrl && !isGenerating && (
                            <div className="flex flex-col gap-4">
                                <div className="flex flex-col sm:flex-row gap-4 items-start">
                                    {/* Image Upload */}
                                    <div className="flex-1 w-full">
                                        <label className="text-xs text-gray-400 mb-2 block">Reference Image (Image-to-Video)</label>
                                        <div 
                                            onClick={() => fileInputRef.current?.click()}
                                            className="border border-dashed border-gray-600 rounded-lg p-4 flex flex-col items-center justify-center cursor-pointer hover:bg-white/5 transition-colors h-32 relative group/upload"
                                        >
                                            {uploadedImage ? (
                                                <>
                                                    <img src={uploadedImage} alt="Reference" className="h-full object-contain opacity-60 group-hover/upload:opacity-40 transition-opacity" />
                                                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/upload:opacity-100 transition-opacity">
                                                        <span className="text-xs bg-black/80 px-2 py-1 rounded text-white">Change Image</span>
                                                    </div>
                                                </>
                                            ) : (
                                                <>
                                                    <Upload className="w-6 h-6 text-gray-500 mb-2" />
                                                    <span className="text-xs text-gray-500 text-center">Upload Reference Image<br/>(Optional)</span>
                                                </>
                                            )}
                                            <input 
                                                ref={fileInputRef} 
                                                type="file" 
                                                accept="image/*" 
                                                className="hidden" 
                                                onChange={handleImageUpload}
                                            />
                                        </div>
                                    </div>

                                    {/* Controls */}
                                    <div className="flex-1 w-full">
                                        <label className="text-xs text-gray-400 mb-2 block">Settings</label>
                                        <div className="flex gap-2 mb-4">
                                            <button 
                                                onClick={() => setAspectRatio('16:9')}
                                                className={`flex-1 py-2 text-xs rounded border transition-all ${aspectRatio === '16:9' ? 'bg-brand-600 border-brand-500 text-white' : 'bg-transparent border-gray-700 text-gray-400 hover:border-gray-500'}`}
                                            >
                                                16:9 (Landscape)
                                            </button>
                                            <button 
                                                onClick={() => setAspectRatio('9:16')}
                                                className={`flex-1 py-2 text-xs rounded border transition-all ${aspectRatio === '9:16' ? 'bg-brand-600 border-brand-500 text-white' : 'bg-transparent border-gray-700 text-gray-400 hover:border-gray-500'}`}
                                            >
                                                9:16 (Portrait)
                                            </button>
                                        </div>
                                        <button 
                                            onClick={handleGenerateVideo}
                                            className="w-full py-3 bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-500 hover:to-brand-400 text-white font-bold rounded-lg shadow-lg shadow-brand-900/50 flex items-center justify-center gap-2 transition-all transform hover:scale-[1.02] active:scale-[0.98]"
                                        >
                                            <Sparkles className="w-4 h-4" />
                                            Generate with Veo
                                        </button>
                                    </div>
                                </div>
                                {error && (
                                    <div className="text-xs text-red-400 bg-red-900/20 p-2 rounded border border-red-900/50 flex items-center gap-2">
                                        <AlertCircle className="w-3 h-3" />
                                        {error}
                                    </div>
                                )}
                            </div>
                        )}

                        {isGenerating && (
                            <div className="flex flex-col items-center justify-center py-8 text-center space-y-4">
                                <div className="relative">
                                    <div className="absolute inset-0 bg-brand-neon blur-lg opacity-30 animate-pulse"></div>
                                    <Loader2 className="w-8 h-8 text-brand-neon animate-spin relative z-10" />
                                </div>
                                <div>
                                    <h4 className="text-brand-100 font-medium animate-pulse">{loadingMsg}</h4>
                                    <p className="text-xs text-gray-500 mt-1">This usually takes about 60 seconds</p>
                                </div>
                            </div>
                        )}

                        {generatedVideoUrl && (
                            <div className="animate-in fade-in zoom-in duration-300">
                                <div className="relative rounded-lg overflow-hidden bg-black border border-gray-700 group/video">
                                    <video 
                                        src={generatedVideoUrl} 
                                        controls 
                                        autoPlay 
                                        loop 
                                        className={`w-full max-h-[400px] object-contain ${aspectRatio === '9:16' ? 'aspect-[9/16]' : 'aspect-video'}`}
                                    />
                                    <div className="absolute top-2 right-2 flex gap-2 opacity-0 group-hover/video:opacity-100 transition-opacity">
                                        <a 
                                            href={generatedVideoUrl} 
                                            download={`scene-${scene.id}-veo.mp4`}
                                            className="bg-black/60 hover:bg-black/80 text-white p-1.5 rounded"
                                            title="Download Video"
                                        >
                                            <Video className="w-4 h-4" />
                                        </a>
                                    </div>
                                </div>
                                <div className="mt-3 flex justify-between items-center">
                                    <span className="text-xs text-brand-neon flex items-center gap-1">
                                        <Check className="w-3 h-3" /> Generated Successfully
                                    </span>
                                    <button 
                                        onClick={() => setGeneratedVideoUrl(null)}
                                        className="text-xs text-gray-400 hover:text-white underline"
                                    >
                                        Generate New Version
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>

      </div>
    </div>
  );
};
