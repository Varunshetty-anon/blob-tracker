import React, { useEffect, useRef, useState, useCallback } from 'react';
import { CVProcessor } from '../services/cvProcessor';
import { TrackerSettings, DetectedBlob, ProcessingStats, RenderState } from '../types';

// Performance Config
const PREVIEW_MAX_DIMENSION = 480; // Limit CV processing size for preview

interface BlobTrackerProps {
  videoFile: File | null;
  settings: TrackerSettings;
  renderState: RenderState;
  onStatsUpdate: (stats: ProcessingStats) => void;
  onRenderProgress: (progress: number) => void;
  onRenderComplete: (blob: Blob, extension: string) => void;
}

const BlobTracker: React.FC<BlobTrackerProps> = ({
  videoFile,
  settings,
  renderState,
  onStatsUpdate,
  onRenderProgress,
  onRenderComplete
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Elements
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null); // Visual display canvas
  
  // Offscreen Processors
  const processCanvasRef = useRef<HTMLCanvasElement>(null); // Low-res CV input
  
  const cvProcessor = useRef<CVProcessor>(new CVProcessor(window.cv));
  const requestRef = useRef<number>(0);
  
  // State
  const [videoLoaded, setVideoLoaded] = useState(false);
  const [cvReady, setCvReady] = useState(false);
  const [dimensions, setDimensions] = useState({ w: 640, h: 360 });
  const [previewScale, setPreviewScale] = useState(1);
  
  // Initialization
  useEffect(() => {
    const checkCv = setInterval(() => {
      if (window.cv && window.cv.Mat) {
        setCvReady(true);
        clearInterval(checkCv);
      }
    }, 100);
    return () => clearInterval(checkCv);
  }, []);

  // Video Load Handler
  useEffect(() => {
    if (videoFile && videoRef.current) {
      const url = URL.createObjectURL(videoFile);
      videoRef.current.src = url;
      videoRef.current.load();
      setVideoLoaded(false);
      
      videoRef.current.onloadedmetadata = () => {
        if (!videoRef.current) return;
        const vw = videoRef.current.videoWidth;
        const vh = videoRef.current.videoHeight;
        
        setDimensions({ w: vw, h: vh });
        
        // Calculate preview scale (how much to shrink video for fast CV)
        const maxDim = Math.max(vw, vh);
        const scale = maxDim > PREVIEW_MAX_DIMENSION ? maxDim / PREVIEW_MAX_DIMENSION : 1;
        setPreviewScale(scale);

        setVideoLoaded(true);
      };
    }
  }, [videoFile]);

  // --------------- HELPER: DRAW OVERLAYS ----------------
  const drawOverlays = (
    ctx: CanvasRenderingContext2D, 
    blobs: DetectedBlob[], 
    width: number, 
    height: number,
    time: number
  ) => {
    // Note: Do NOT clearRect here, as we draw on top of the video frame.
    // ctx.clearRect(0, 0, width, height); 

    blobs.forEach(blob => {
      // Color Logic
      let color = settings.baseColor;
      if (settings.colorMode === 'cycle') {
        const hue = (time * 0.1 + blob.id * 30) % 360;
        color = `hsl(${hue}, 100%, 60%)`;
      } else if (settings.colorMode === 'random') {
        const hue = (blob.id * 137.508) % 360; // Golden angle hash
        color = `hsl(${hue}, 100%, 60%)`;
      }

      // Organic Movement Logic (Lerp + Jitter)
      // Initialize visual pos if missing
      if (blob.visualX === undefined) blob.visualX = blob.x;
      if (blob.visualY === undefined) blob.visualY = blob.y;

      // 1. Drift (Lag) - Interpolate towards actual position
      // Lower factor = more lag/drift. Map 0-1 settings to useful range.
      const lerpFactor = 0.8 - (settings.drift * 0.7); 
      blob.visualX = blob.visualX + (blob.x - blob.visualX) * lerpFactor;
      blob.visualY = blob.visualY + (blob.y - blob.visualY) * lerpFactor;

      // 2. Jitter (Noise)
      const noiseX = (Math.sin(time * 0.01 + blob.id) + Math.cos(time * 0.05)) * settings.jitter * 20;
      const noiseY = (Math.cos(time * 0.01 + blob.id) + Math.sin(time * 0.03)) * settings.jitter * 20;

      const drawX = blob.visualX + noiseX;
      const drawY = blob.visualY + noiseY;

      // DRAWING
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = 2; // Thicker lines for pro look

      // Trails
      if (settings.showTrails && blob.history.length > 1) {
        ctx.beginPath();
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.6;
        // Draw history with some jitter too? minimal
        const h0 = blob.history[0];
        ctx.moveTo(h0.x, h0.y);
        for (let i = 1; i < blob.history.length; i++) {
          const pt = blob.history[i];
          ctx.lineTo(pt.x, pt.y);
        }
        ctx.lineTo(drawX, drawY);
        ctx.stroke();
        ctx.globalAlpha = 1.0;
        ctx.lineWidth = 2;
      }

      // Box / Corners
      const size = Math.sqrt(blob.area) * 0.8; // Estimate size from area
      const cornerLen = size * 0.3;
      
      ctx.shadowColor = color;
      ctx.shadowBlur = 15; // Neon glow

      ctx.beginPath();
      // Top Left
      ctx.moveTo(drawX - size/2, drawY - size/2 + cornerLen);
      ctx.lineTo(drawX - size/2, drawY - size/2);
      ctx.lineTo(drawX - size/2 + cornerLen, drawY - size/2);
      // Top Right
      ctx.moveTo(drawX + size/2 - cornerLen, drawY - size/2);
      ctx.lineTo(drawX + size/2, drawY - size/2);
      ctx.lineTo(drawX + size/2, drawY - size/2 + cornerLen);
      // Bottom Right
      ctx.moveTo(drawX + size/2, drawY + size/2 - cornerLen);
      ctx.lineTo(drawX + size/2, drawY + size/2);
      ctx.lineTo(drawX + size/2 - cornerLen, drawY + size/2);
      // Bottom Left
      ctx.moveTo(drawX - size/2 + cornerLen, drawY + size/2);
      ctx.lineTo(drawX - size/2, drawY + size/2);
      ctx.lineTo(drawX - size/2, drawY + size/2 - cornerLen);
      ctx.stroke();

      // Center Crosshair
      ctx.beginPath();
      ctx.moveTo(drawX - 5, drawY);
      ctx.lineTo(drawX + 5, drawY);
      ctx.moveTo(drawX, drawY - 5);
      ctx.lineTo(drawX, drawY + 5);
      ctx.stroke();

      // Info Text (HUD)
      if (settings.showHud) {
        ctx.shadowBlur = 0;
        ctx.font = "12px monospace";
        ctx.fillText(`TRK_${blob.id} [${Math.floor(blob.area)}]`, drawX + size/2 + 5, drawY - size/2);
      }
      ctx.shadowBlur = 0;
    });
  };

  // --------------- RENDER PIPELINE (Generate) ----------------
  // This effect runs once when renderState switches to 'rendering'
  useEffect(() => {
    if (renderState !== 'rendering' || !videoRef.current || !videoLoaded) return;

    let cancelled = false;
    const vid = videoRef.current;
    
    const runRender = async () => {
      // 1. Setup Canvas for Recording (Full Res)
      const renderCanvas = document.createElement('canvas');
      renderCanvas.width = dimensions.w;
      renderCanvas.height = dimensions.h;
      const ctx = renderCanvas.getContext('2d');
      if (!ctx) return;

      // 2. Setup Recorder with MP4 priority
      const stream = renderCanvas.captureStream(0); // 0 FPS (manual frame request)
      const track = stream.getVideoTracks()[0];
      // @ts-ignore - Check for requestFrame support
      if (!track.requestFrame) {
        console.warn("Browser does not support track.requestFrame(). Export might vary in framerate.");
      }

      let mimeType = '';
      let extension = 'webm';

      // Priority: MP4 (H.264) > MP4 (Generic) > WebM (VP9) > WebM (Generic)
      if (MediaRecorder.isTypeSupported("video/mp4; codecs=avc1.42E01E, mp4a.40.2")) {
        mimeType = "video/mp4; codecs=avc1.42E01E, mp4a.40.2";
        extension = 'mp4';
      } else if (MediaRecorder.isTypeSupported("video/mp4")) {
        mimeType = "video/mp4";
        extension = 'mp4';
      } else if (MediaRecorder.isTypeSupported("video/webm;codecs=vp9")) {
        mimeType = "video/webm;codecs=vp9";
        extension = 'webm';
      } else {
        mimeType = "video/webm";
        extension = 'webm';
      }

      console.log(`Using Export Format: ${mimeType}`);

      const recorder = new MediaRecorder(stream, { 
        mimeType, 
        videoBitsPerSecond: 25000000 // High bitrate (25Mbps)
      });
      
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      recorder.start();

      // 3. Loop Video Frame-by-Frame
      vid.pause();
      vid.currentTime = 0;
      
      const fps = 30; // Target export FPS
      const frameDuration = 1 / fps;
      let currentTime = 0;
      const duration = vid.duration;

      // Disable processor scaling for render (full quality)
      cvProcessor.current.cleanup(); // Reset for full res

      while (currentTime < duration && !cancelled) {
        // Seek
        vid.currentTime = currentTime;
        
        // Wait for seek to complete
        await new Promise<void>(resolve => {
           const onSeek = () => {
             vid.removeEventListener('seeked', onSeek);
             resolve();
           };
           vid.addEventListener('seeked', onSeek);
           // Fallback in case seeked doesn't fire fast enough
           setTimeout(() => {
             vid.removeEventListener('seeked', onSeek);
             resolve();
           }, 200); 
        });

        // Processing
        ctx.drawImage(vid, 0, 0);
        
        // Process at FULL resolution (scaleFactor = 1)
        const blobs = cvProcessor.current.processFrame(ctx, dimensions.w, dimensions.h, settings, 1);

        // Draw Visuals
        if (!settings.showVideo) {
          ctx.fillStyle = '#000000';
          ctx.fillRect(0, 0, dimensions.w, dimensions.h);
        }

        drawOverlays(ctx, blobs, dimensions.w, dimensions.h, currentTime * 1000);

        // Commit Frame
        // @ts-ignore
        if (track.requestFrame) track.requestFrame();
        
        // Progress
        onRenderProgress(Math.min(100, Math.round((currentTime / duration) * 100)));
        
        currentTime += frameDuration;
        
        // Small yield to UI
        await new Promise(r => setTimeout(r, 0));
      }

      // Finish
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: mimeType });
        onRenderComplete(blob, extension);
      };
      recorder.stop();
      
      // Restore video state
      vid.currentTime = 0;
    };

    runRender();

    return () => { cancelled = true; };
  }, [renderState, dimensions, settings, videoLoaded]);


  // --------------- LIVE PREVIEW LOOP ----------------
  const animate = useCallback((time: number) => {
    if (renderState === 'rendering') return; // Pause preview loop during render
    
    if (!canvasRef.current || !videoRef.current || !processCanvasRef.current || !cvReady) {
      requestRef.current = requestAnimationFrame(animate);
      return;
    }

    const ctx = canvasRef.current.getContext('2d');
    const vid = videoRef.current;
    
    // Check if playing
    if (vid.paused && !vid.seeking) {
        // Still draw once if paused? Yes, to keep overlays visible on pause
        // But skip heavy CV if paused, unless we want to see result of parameter change
        // For perf: We will run CV even on pause, but maybe throttled? 
        // Let's run it. The preview scaling makes it cheap.
    }

    const w = dimensions.w;
    const h = dimensions.h;

    // 1. Draw Display Video
    // Note: This logic must match the render loop visually
    if (settings.showVideo) {
      ctx?.drawImage(vid, 0, 0, w, h);
    } else {
      if (ctx) {
          ctx.fillStyle = '#000000';
          ctx.fillRect(0, 0, w, h);
      }
    }

    // 2. Process CV (Scaled Down)
    // We only update tracking if we have a frame
    const pW = Math.floor(w / previewScale);
    const pH = Math.floor(h / previewScale);
    
    // Resize offscreen canvas if needed
    if (processCanvasRef.current.width !== pW) {
        processCanvasRef.current.width = pW;
        processCanvasRef.current.height = pH;
    }
    const pCtx = processCanvasRef.current.getContext('2d', { willReadFrequently: true });
    
    let blobs: DetectedBlob[] = [];
    if (pCtx) {
        const tStart = performance.now();
        pCtx.drawImage(vid, 0, 0, pW, pH);
        // Pass scale factor to processor so it returns coordinate in full video space
        blobs = cvProcessor.current.processFrame(pCtx, pW, pH, settings, previewScale);
        
        const tEnd = performance.now();
        onStatsUpdate({
            fps: Math.round(1000 / Math.max(1, tEnd - tStart)),
            blobCount: blobs.length,
            resolution: `${w}x${h} (Preview scale 1:${previewScale.toFixed(1)})`,
            renderTime: tEnd - tStart
        });
    }

    // 3. Draw Overlays (High Res on Display Canvas)
    if (ctx) drawOverlays(ctx, blobs, w, h, performance.now());

    requestRef.current = requestAnimationFrame(animate);
  }, [dimensions, previewScale, cvReady, settings, renderState, onStatsUpdate]);

  useEffect(() => {
    requestRef.current = requestAnimationFrame(animate);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [animate]);

  return (
    <div ref={containerRef} className="relative w-full h-full flex items-center justify-center bg-black overflow-hidden shadow-2xl">
      
      {/* Loading Overlay */}
      {!cvReady && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-cyber-black/90 backdrop-blur-md">
            <div className="text-neon-blue font-mono animate-pulse text-xl tracking-widest">[ SYSTEM BOOT ]</div>
            <div className="mt-2 text-gray-500 text-xs">Loading Computer Vision Modules...</div>
        </div>
      )}

      {/* Render Progress Overlay */}
      {renderState === 'rendering' && (
         <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm">
             <div className="text-neon-blue font-mono text-2xl tracking-widest mb-4">RENDERING SEQUENCE</div>
             <div className="w-64 h-1 bg-gray-800 rounded overflow-hidden">
                <div id="render-bar-fill" className="h-full bg-neon-blue transition-all duration-75 ease-out" style={{width: '0%'}}></div>
             </div>
             <div className="mt-2 text-gray-400 font-mono text-xs animate-pulse">DO NOT CLOSE WINDOW</div>
         </div>
      )}

      {/* Source Video (Hidden) */}
      <video
        ref={videoRef}
        className="hidden"
        muted
        playsInline
        loop
        crossOrigin="anonymous"
      />

      {/* Process Canvas (Hidden, low res) */}
      <canvas ref={processCanvasRef} className="hidden" />

      {/* Main Display Canvas */}
      <canvas
        ref={canvasRef}
        width={dimensions.w}
        height={dimensions.h}
        className="max-w-full max-h-full object-contain shadow-[0_0_20px_rgba(0,0,0,0.5)]"
      />
      
      {/* Grid Decoration */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.03]"
        style={{
           backgroundImage: `
             linear-gradient(rgba(0, 243, 255, 1) 1px, transparent 1px), 
             linear-gradient(90deg, rgba(0, 243, 255, 1) 1px, transparent 1px)
           `,
           backgroundSize: '50px 50px'
        }}
      />
    </div>
  );
};

export default BlobTracker;