import { DetectedBlob, TrackerSettings } from '../types';

const MAX_TRACKING_DISTANCE_BASE = 100; // Scaled by resolution
const BLOB_TIMEOUT = 500; 

export class CVProcessor {
  private cv: any;
  
  // Reusable OpenCV Mats
  private src: any = null;
  private dst: any = null;
  private gray: any = null;
  private hierarchy: any = null;
  private contours: any = null;

  // State
  private nextBlobId = 1;
  private activeBlobs: Map<number, DetectedBlob> = new Map();
  private lastDimensions = { w: 0, h: 0 };

  constructor(cv?: any) {
    this.cv = cv || (typeof window !== 'undefined' ? window.cv : null);
  }

  public isReady(): boolean {
    return !!this.cv || (typeof window !== 'undefined' && !!window.cv);
  }

  // Initialize or resize Mats only when necessary
  private ensureMats(width: number, height: number) {
    if (!this.cv && typeof window !== 'undefined' && window.cv) {
      this.cv = window.cv;
    }

    if (!this.cv) return;
    
    if (this.src && this.lastDimensions.w === width && this.lastDimensions.h === height) {
      return;
    }

    this.cleanup(); // Force release old memory if size changes

    try {
      this.src = new this.cv.Mat(height, width, this.cv.CV_8UC4);
      this.dst = new this.cv.Mat(height, width, this.cv.CV_8UC1);
      this.gray = new this.cv.Mat();
      this.hierarchy = new this.cv.Mat();
      this.contours = new this.cv.MatVector();
      this.lastDimensions = { w: width, h: height };
    } catch (e) {
      console.error("OpenCV Mat Allocation Error:", e);
    }
  }

  public cleanup() {
    if (!this.cv && typeof window !== 'undefined' && window.cv) {
      this.cv = window.cv;
    }
    if (!this.cv) return;
    
    if (this.src) this.src.delete();
    if (this.dst) this.dst.delete();
    if (this.gray) this.gray.delete();
    if (this.hierarchy) this.hierarchy.delete();
    if (this.contours) this.contours.delete();
    
    this.src = null;
    this.dst = null;
    this.gray = null;
    this.hierarchy = null;
    this.contours = null;
    this.lastDimensions = { w: 0, h: 0 };
  }

  /**
   * Process frame with support for downscaling (Performance)
   * @param ctx - Source Canvas Context (could be small offscreen or full size)
   * @param width - actual processing width
   * @param height - actual processing height
   * @param scaleFactor - multiplier to convert processed coords back to original video space
   */
  public processFrame(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, 
    width: number, 
    height: number, 
    settings: TrackerSettings,
    scaleFactor: number = 1
  ): DetectedBlob[] {
    // Lazy init
    if (!this.cv && typeof window !== 'undefined' && window.cv) {
      this.cv = window.cv;
    }

    if (!this.cv) return [];

    this.ensureMats(width, height);
    if (!this.src) return [];

    // 1. Read Pixel Data
    try {
      const imgData = ctx.getImageData(0, 0, width, height);
      this.src.data.set(imgData.data);
    } catch(e) {
      console.warn("Frame access error", e);
      return [];
    }

    // 2. CV Pipeline
    this.cv.cvtColor(this.src, this.gray, this.cv.COLOR_RGBA2GRAY, 0);
    
    // Blur (ensure odd kernel size)
    const b = settings.blurSize % 2 === 0 ? settings.blurSize + 1 : settings.blurSize;
    const kSize = new this.cv.Size(b, b);
    this.cv.GaussianBlur(this.gray, this.gray, kSize, 0, 0, this.cv.BORDER_DEFAULT);

    this.cv.threshold(this.gray, this.dst, settings.threshold, 255, this.cv.THRESH_BINARY);

    this.cv.findContours(
      this.dst, 
      this.contours, 
      this.hierarchy, 
      this.cv.RETR_EXTERNAL, 
      this.cv.CHAIN_APPROX_SIMPLE
    );

    // 3. Extract & Scale Coords
    const currentFrameBlobs: Partial<DetectedBlob>[] = [];
    const minAreaScaled = settings.minArea * (scaleFactor * scaleFactor) * 0.1; // Rough adjustment for scale

    for (let i = 0; i < this.contours.size(); ++i) {
      const contour = this.contours.get(i);
      const area = this.cv.contourArea(contour, false);

      // We compare area in processing space, but might need to tune threshold based on scale
      // For simplicity, we assume minArea setting is relative to 1080p, so we scale it down? 
      // Actually, standardizing minArea to "screen pixels" is tricky. 
      // Let's assume minArea is "pixels in the source video". 
      // So processed area needs to be scaled up to compare? No, simpler:
      // Convert area to real-world area (approx)
      const realArea = area * (scaleFactor * scaleFactor);

      if (realArea > settings.minArea) {
        const rect = this.cv.boundingRect(contour);
        
        // Convert to original video coordinates
        currentFrameBlobs.push({
          x: (rect.x + rect.width / 2) * scaleFactor,
          y: (rect.y + rect.height / 2) * scaleFactor,
          w: rect.width * scaleFactor,
          h: rect.height * scaleFactor,
          area: realArea
        });
      }
    }

    // 4. Tracking
    const trackedBlobs: DetectedBlob[] = [];
    const now = Date.now();
    const assignedIds = new Set<number>();
    const maxDist = MAX_TRACKING_DISTANCE_BASE * Math.max(1, scaleFactor);

    currentFrameBlobs.forEach(newBlob => {
      let closestId = -1;
      let minDist = maxDist;

      this.activeBlobs.forEach((existingBlob, id) => {
        if (assignedIds.has(id)) return;

        const dist = Math.hypot(newBlob.x! - existingBlob.x, newBlob.y! - existingBlob.y);
        if (dist < minDist) {
          minDist = dist;
          closestId = id;
        }
      });

      if (closestId !== -1) {
        const existing = this.activeBlobs.get(closestId)!;
        
        const history = [...existing.history, { x: existing.x, y: existing.y }];
        if (history.length > settings.historyLength) history.shift();

        const updated: DetectedBlob = {
          ...existing,
          x: newBlob.x!,
          y: newBlob.y!,
          w: newBlob.w!,
          h: newBlob.h!,
          area: newBlob.area!,
          lastSeen: now,
          history,
          // Preserve visual state from previous frame, to be updated in renderer
          visualX: existing.visualX,
          visualY: existing.visualY
        };

        this.activeBlobs.set(closestId, updated);
        assignedIds.add(closestId);
        trackedBlobs.push(updated);
      } else {
        const newId = this.nextBlobId++;
        const newEntity: DetectedBlob = {
          id: newId,
          x: newBlob.x!,
          y: newBlob.y!,
          w: newBlob.w!,
          h: newBlob.h!,
          area: newBlob.area!,
          lastSeen: now,
          history: [],
          visualX: newBlob.x!,
          visualY: newBlob.y!
        };
        this.activeBlobs.set(newId, newEntity);
        trackedBlobs.push(newEntity);
      }
    });

    // Prune
    this.activeBlobs.forEach((blob, id) => {
      if (now - blob.lastSeen > BLOB_TIMEOUT) {
        this.activeBlobs.delete(id);
      }
    });

    return trackedBlobs;
  }
}