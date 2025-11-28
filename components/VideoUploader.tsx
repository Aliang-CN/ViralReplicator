import React, { useCallback } from 'react';
import { Upload, FileVideo, AlertCircle } from 'lucide-react';
import { VideoFile } from '../types';

interface VideoUploaderProps {
  onFileSelect: (video: VideoFile) => void;
  disabled?: boolean;
}

const MAX_SIZE_MB = 18; // Gemini inline limit is ~20MB, keeping it safe
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;

export const VideoUploader: React.FC<VideoUploaderProps> = ({ onFileSelect, disabled }) => {
  const handleFileChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_SIZE_BYTES) {
      alert(`File size too large. Please upload a video smaller than ${MAX_SIZE_MB}MB for this demo.`);
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      // Extract base64 part
      const base64Data = result.split(',')[1];
      
      onFileSelect({
        file,
        previewUrl: URL.createObjectURL(file),
        base64Data: base64Data,
        mimeType: file.type
      });
    };
    reader.readAsDataURL(file);
  }, [onFileSelect]);

  return (
    <div className="w-full max-w-2xl mx-auto">
      <label 
        className={`
          flex flex-col items-center justify-center w-full h-64 border-2 border-dashed rounded-2xl cursor-pointer 
          transition-all duration-300
          ${disabled ? 'opacity-50 cursor-not-allowed bg-dark-card border-gray-600' : 'bg-dark-card border-brand-500 hover:bg-opacity-80 hover:border-brand-neon'}
        `}
      >
        <div className="flex flex-col items-center justify-center pt-5 pb-6 text-center px-4">
          <div className="p-4 rounded-full bg-brand-900/50 mb-4">
            <Upload className="w-8 h-8 text-brand-neon" />
          </div>
          <p className="mb-2 text-lg font-semibold text-gray-200">
            Click to upload reference video
          </p>
          <p className="mb-2 text-sm text-gray-400">
            MP4, WebM or MOV (Max {MAX_SIZE_MB}MB)
          </p>
          <div className="flex items-center gap-2 text-xs text-brand-500 bg-brand-900/20 px-3 py-1 rounded-full mt-2">
            <AlertCircle className="w-3 h-3" />
            <span>AI analyzes visual style & camera movement</span>
          </div>
        </div>
        <input 
          type="file" 
          className="hidden" 
          accept="video/*"
          onChange={handleFileChange}
          disabled={disabled}
        />
      </label>
    </div>
  );
};