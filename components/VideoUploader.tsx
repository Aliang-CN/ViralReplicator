import React, { useCallback } from 'react';
import { Upload, FileVideo, AlertCircle } from 'lucide-react';
import { VideoFile } from '../types';

interface VideoUploaderProps {
  onFileSelect: (video: VideoFile) => void;
  disabled?: boolean;
}

// Increased limit to support File API uploads
const MAX_SIZE_MB = 200; 
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;
// Threshold for inline base64 usage (10MB)
const INLINE_THRESHOLD_BYTES = 10 * 1024 * 1024;

export const VideoUploader: React.FC<VideoUploaderProps> = ({ onFileSelect, disabled }) => {
  const handleFileChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_SIZE_BYTES) {
      alert(`File size too large. Please upload a video smaller than ${MAX_SIZE_MB}MB.`);
      return;
    }

    // Create a preview URL immediately
    const previewUrl = URL.createObjectURL(file);
    
    // Only generate base64 for small files to avoid memory issues
    if (file.size < INLINE_THRESHOLD_BYTES) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const result = e.target?.result as string;
            const base64Data = result.split(',')[1];
            
            onFileSelect({
                file,
                previewUrl,
                base64Data,
                mimeType: file.type
            });
        };
        reader.readAsDataURL(file);
    } else {
        // For large files, skip base64 generation
        onFileSelect({
            file,
            previewUrl,
            base64Data: undefined, // Explicitly undefined
            mimeType: file.type
        });
    }

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