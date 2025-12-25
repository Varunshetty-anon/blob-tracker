import React, { useEffect, useRef, useState, useCallback } from 'react';
import { CVProcessor } from '../services/cvProcessor';
import { TrackerSettings, DetectedBlob, ProcessingStats, RenderState } from '../types';

// Performance Config
const PREVIEW_MAX_DIMENSION = 480; // Limit CV processing size for preview

interface BlobTrackerProps {
  videoFile: File | null;
  isPlaying: boolean;
  settings: TrackerSettings;
  renderState: RenderState;
  onStatsUpdate: (stats: ProcessingStats) => void;
  onRenderProgress: (progress: number) => void;
  onRenderComplete: (blob: Blob, extension: string) => void;
}

const BlobTracker: React.FC<BlobTrackerProps> = ({
  videoFile,
  isPlaying,
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

  // Video Playback Control
  useEffect(() => {
    if (videoRef.current && videoLoaded && renderState === 'idle') {
      if (isPlaying) {
        videoRef.current.play().catch(e => console.error("Play failed", e));
      } else {
        videoRef.current.pause();
      }
    }
  }, [isPlaying, videoLoaded, renderState]);

  // --------------- HELPER: DRAW OVERLAYS ----------------
  const drawOverlays = (
    ctx: CanvasRenderingContext2D, 
    blobs: DetectedBlob[], 
    width: number, 
    height: number,
    time: number
  ) => {
    // Note: Do NOT clearRect here, as we draw on top of the video frame.

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
      // Corners
      ctx.moveTo(drawX - size/2, drawY - size/2 + cornerLen);
      ctx.lineTo(drawX - size/2, drawY - size/2);
      ctx.lineTo(drawX - size/2 + cornerLen, drawY - size/2);
      
      ctx.moveTo(drawX + size/2 - cornerLen, drawY - size/2);
      ctx.lineTo(drawX + size/2, drawY - size/2);
      ctx.lineTo(drawX + size/2, drawY - size/2 + cornerLen);
      
      ctx.moveTo(drawX + size/2, drawY + size/2 - cornerLen);
      ctx.lineTo(drawX + size/2, drawY + size/2);
      ctx.lineTo(drawX + size/2 - cornerLen, drawY + size/2);
      
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

      // 2. Determine Export Format (Prioritize MP4)
      let mimeType = '';
      let extension = 'webm';
      
      const mp4Types = [
        "video/mp4; codecs=avc1.42E01E, mp4a.40.2",
        "video/mp4; codecs=h264",
        "video/mp4; codecs=avc1",
        "video/mp4"
      ];
      
      // Try finding a supported MP4 type
      const supportedMp4 = mp4Types.find(type => MediaRecorder.isTypeSupported(type));

      if (supportedMp4) {
        mimeType = supportedMp4;
        extension = 'mp4';
      } else if (MediaRecorder.isTypeSupported("video/webm;codecs=vp9")) {
        mimeType = "video/webm;codecs=vp9";
        extension = 'webm';
      } else {
        mimeType = "video/webm";
        extension = 'webm';
      }

      console.log(`Using Export Format: ${mimeType}`);

      // 3. Setup Stream
      // Note: We use 0 fps for manual capture if requestFrame is supported.
      let stream: MediaStream;
      let track: any = null;
      
      try {
        // Try to capture stream with 0FPS for manual frame control
        stream = renderCanvas.captureStream(0);
        track = stream.getVideoTracks()[0];
        
        // If requestFrame is missing (e.g. Firefox), we might need fallback
        if (!track.requestFrame) {
            console.warn("Browser track.requestFrame() missing. Falling back to auto-capture stream (30fps).");
            // Re-create stream with 30fps auto-capture. 
            // Note: This won't be perfect frame-by-frame if rendering is slow, but better than nothing.
            stream = renderCanvas.captureStream(30);
        }
      } catch (e) {
         console.warn("captureStream error", e);
         stream = renderCanvas.captureStream(30);
      }

      const recorder = new MediaRecorder(stream, { 
        mimeType, 
        videoBitsPerSecond: 15000000 // 15Mbps
      });
      
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      recorder.start();

      // 4. Render Loop
      vid.pause();
      vid.currentTime = 0;
      
      const targetFps = 30; 
      const frameDuration = 1 / targetFps;
      let currentTime = 0;
      const duration = vid.duration || 10; // Fallback duration

      cvProcessor.current.cleanup(); // Reset for full res processing

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
           // Timeout fallback
           setTimeout(() => {
               vid.removeEventListener('seeked', onSeek);
               resolve(); 
           }, 500); 
        });

        // Processing
        ctx.drawImage(vid, 0, 0);
        
        const blobs = cvProcessor.current.processFrame(ctx, dimensions.w, dimensions.h, settings, 1);

        // Draw Visuals
        if (!settings.showVideo) {
          ctx.fillStyle = '#000000';
          ctx.fillRect(0, 0, dimensions.w, dimensions.h);
        }

        drawOverlays(ctx, blobs, dimensions.w, dimensions.h, currentTime * 1000);

        // Commit Frame
        if (track && track.requestFrame) {
            track.requestFrame();
        } else {
            // For browsers without requestFrame, we just draw. 
            // Since we initialized captureStream(30), it is sampling automatically.
            // We need to wait slightly to ensure the sample is taken? 
            // This is imperfect but the best we can do without requestFrame.
            await new Promise(r => setTimeout(r, 1000/60)); 
        }
        
        // Progress
        onRenderProgress(Math.min(100, Math.round((currentTime / duration) * 100)));
        
        currentTime += frameDuration;
        
        // Yield to event loop
        await new Promise(r => setTimeout(r, 0));
      }

      // Finish
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: mimeType });
        onRenderComplete(blob, extension);
      };
      recorder.stop();
      
      // Reset
      vid.currentTime = 0;
    };

    runRender();

    return () => { cancelled = true; };
  }, [renderState, dimensions, settings, videoLoaded]);


  // --------------- LIVE PREVIEW LOOP ----------------
  const animate = useCallback((time: number) => {
    if (renderState === 'rendering') return;
    
    if (!canvasRef.current || !videoRef.current || !processCanvasRef.current || !cvReady) {
      requestRef.current = requestAnimationFrame(animate);
      return;
    }

    const ctx = canvasRef.current.getContext('2d');
    const vid = videoRef.current;
    const w = dimensions.w;
    const h = dimensions.h;

    // 1. Draw Display Video
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
    
    if (processCanvasRef.current.width !== pW) {
        processCanvasRef.current.width = pW;
        processCanvasRef.current.height = pH;
    }
    const pCtx = processCanvasRef.current.getContext('2d', { willReadFrequently: true });
    
    let blobs: DetectedBlob[] = [];
    if (pCtx) {
        const tStart = performance.now();
        pCtx.drawImage(vid, 0, 0, pW, pH);
        blobs = cvProcessor.current.processFrame(pCtx, pW, pH, settings, previewScale);
        
        const tEnd = performance.now();
        onStatsUpdate({
            fps: Math.round(1000 / Math.max(1, tEnd - tStart)),
            blobCount: blobs.length,
            resolution: `${w}x${h} (Preview scale 1:${previewScale.toFixed(1)})`,
            renderTime: tEnd - tStart
        });
    }

    // 3. Draw Overlays
    if (ctx) drawOverlays(ctx, blobs, w, h, performance.now());

    requestRef.current = requestAnimationFrame(animate);
  }, [dimensions, previewScale, cvReady, settings, renderState, onStatsUpdate, isPlaying]); // Added isPlaying dependency if needed? No, ref is enough.

  useEffect(() => {
    requestRef.current = requestAnimationFrame(animate);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [animate]);

  return (
    <div ref={containerRef} className="relative w-full h-full flex items-center justify-center bg-black overflow-hidden shadow-2xl">
      
      {!cvReady && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-cyber-black/90 backdrop-blur-md">
            <div className="text-neon-blue font-mono animate-pulse text-xl tracking-widest">[ SYSTEM BOOT ]</div>
            <div className="mt-2 text-gray-500 text-xs">Loading Computer Vision Modules...</div>
        </div>
      )}

      {renderState === 'rendering' && (
         <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm">
             <div className="text-neon-blue font-mono text-2xl tracking-widest mb-4">RENDERING SEQUENCE</div>
             <div className="w-64 h-1 bg-gray-800 rounded overflow-hidden">
                <div id="render-bar-fill" className="h-full bg-neon-blue transition-all duration-75 ease-out" style={{width: '0%'}}></div>
             </div>
             <div className="mt-2 text-gray-400 font-mono text-xs animate-pulse">DO NOT CLOSE WINDOW</div>
         </div>
      )}

      <video
        ref={videoRef}
        className="hidden"
        muted
        playsInline
        loop
        crossOrigin="anonymous"
      />
      <canvas ref={processCanvasRef} className="hidden" />

      <canvas
        ref={canvasRef}
        width={dimensions.w}
        height={dimensions.h}
        className="max-w-full max-h-full object-contain shadow-[0_0_20px_rgba(0,0,0,0.5)]"
      />
      
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