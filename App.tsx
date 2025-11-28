import React, { useState } from 'react';
import { VideoUploader } from './components/VideoUploader';
import { AnalysisResultView } from './components/AnalysisResultView';
import { analyzeVideoScript } from './services/geminiService';
import { AppState, VideoFile, AnalysisResult } from './types';
import { Loader2, Zap, LayoutTemplate } from 'lucide-react';

const App: React.FC = () => {
  const [state, setState] = useState<AppState>(AppState.IDLE);
  const [currentVideo, setCurrentVideo] = useState<VideoFile | null>(null);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleFileSelect = async (video: VideoFile) => {
    setCurrentVideo(video);
    setErrorMsg(null);
    setState(AppState.ANALYZING);

    try {
      // We now pass the file object directly. The service handles base64 conversion or file upload.
      const result = await analyzeVideoScript(video.file);
      setAnalysisResult(result);
      setState(AppState.SUCCESS);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "An unexpected error occurred during analysis.");
      setState(AppState.ERROR);
    }
  };

  const resetApp = () => {
    setState(AppState.IDLE);
    setCurrentVideo(null);
    setAnalysisResult(null);
    setErrorMsg(null);
  };

  return (
    <div className="min-h-screen bg-dark-bg text-dark-text selection:bg-brand-500 selection:text-white">
      {/* Navbar */}
      <nav className="border-b border-gray-800 bg-dark-bg/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={resetApp}>
            <div className="bg-brand-600 p-1.5 rounded-lg">
                <Zap className="w-5 h-5 text-white" fill="currentColor" />
            </div>
            <span className="font-bold text-xl tracking-tight text-white">Viral<span className="text-brand-neon">Replicator</span></span>
          </div>
          <div className="text-xs font-mono text-gray-500 border border-gray-800 px-2 py-1 rounded">
             Powered by Gemini 2.5
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        
        {/* Intro Header */}
        {state === AppState.IDLE && (
          <div className="text-center mb-16 space-y-4 animate-in fade-in zoom-in duration-500">
            <h1 className="text-4xl md:text-6xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-white via-brand-200 to-brand-neon">
              Reverse Engineer <br className="hidden md:block"/> Viral Videos Instantly
            </h1>
            <p className="text-lg md:text-xl text-gray-400 max-w-2xl mx-auto">
              Upload a reference video. We extract the storyboard, camera movements, and generate professional AI prompts for you to replicate it.
            </p>
          </div>
        )}

        {/* Main Content Area */}
        <div className="flex flex-col items-center justify-center min-h-[50vh]">
          
          {/* Uploader State */}
          {state === AppState.IDLE && (
             <VideoUploader onFileSelect={handleFileSelect} />
          )}

          {/* Loading State */}
          {state === AppState.ANALYZING && (
            <div className="flex flex-col items-center space-y-6 text-center animate-in fade-in duration-500">
              <div className="relative">
                <div className="absolute inset-0 bg-brand-neon blur-xl opacity-20 animate-pulse"></div>
                <Loader2 className="w-16 h-16 text-brand-neon animate-spin relative z-10" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white">Analyzing Video Structure...</h3>
                <p className="text-gray-400 mt-2">
                  {currentVideo && currentVideo.file.size > 10 * 1024 * 1024 
                    ? "Uploading large video to Gemini & Processing..."
                    : "Gemini is decomposing scenes & identifying camera angles..."}
                </p>
              </div>
            </div>
          )}

          {/* Error State */}
          {state === AppState.ERROR && (
             <div className="text-center space-y-4 bg-red-900/10 border border-red-900/50 p-8 rounded-2xl max-w-lg">
                <div className="text-red-500 font-bold text-xl">Analysis Failed</div>
                <p className="text-gray-300">{errorMsg}</p>
                <button 
                  onClick={resetApp}
                  className="px-6 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-white font-medium transition-colors border border-gray-700"
                >
                  Try Again
                </button>
             </div>
          )}

          {/* Success Result State */}
          {state === AppState.SUCCESS && analysisResult && currentVideo && (
            <div className="w-full">
               <div className="flex justify-between items-center mb-8">
                  <button 
                    onClick={resetApp}
                    className="text-sm text-gray-400 hover:text-white flex items-center gap-1 transition-colors"
                  >
                    ← Analyze Another Video
                  </button>
               </div>
               <AnalysisResultView result={analysisResult} videoUrl={currentVideo.previewUrl} />
            </div>
          )}

        </div>
      </main>
    </div>
  );
};

export default App;