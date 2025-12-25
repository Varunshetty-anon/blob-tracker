export type ColorMode = 'solid' | 'cycle' | 'random';

export interface TrackerSettings {
  // CV Parameters
  threshold: number;      // 0-255
  minArea: number;        // Minimum pixel area
  blurSize: number;       // Blur kernel size (odd numbers)
  
  // Visual / Organic Parameters
  historyLength: number;
  jitter: number;         // 0.0 - 1.0 (Random noise)
  drift: number;          // 0.0 - 1.0 (Smooth delay/lag)
  
  // Display
  showHud: boolean;
  showTrails: boolean;
  showVideo: boolean;
  
  // Colors
  colorMode: ColorMode;
  baseColor: string;      // Hex
}

export interface Point {
  x: number;
  y: number;
}

export interface DetectedBlob {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  area: number;
  history: Point[];
  lastSeen: number;
  // Visual state for organic movement
  visualX?: number; 
  visualY?: number;
}

export type ProcessingStats = {
  fps: number;
  blobCount: number;
  resolution: string;
  renderTime: number;
};

export type RenderState = 'idle' | 'rendering' | 'completed';

declare global {
  interface Window {
    cv: any;
    cvLoaded: boolean;
  }
}