export interface StoryboardScene {
  id: number;
  timeRange: string;
  visualDescription: string;
  cameraMovement: string;
  aiImagePrompt: string; // For Midjourney/Stable Diffusion
  aiVideoPrompt: string; // For Runway/Luma/Sora
  voiceoverScript?: string;
}

export interface AnalysisResult {
  title: string;
  summary: string;
  scenes: StoryboardScene[];
}

export enum AppState {
  IDLE = 'IDLE',
  ANALYZING = 'ANALYZING',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR'
}

export interface VideoFile {
  file: File;
  previewUrl: string;
  base64Data?: string;
  mimeType: string;
}

declare global {
  interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
  }
}