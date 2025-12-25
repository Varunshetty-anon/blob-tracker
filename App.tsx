import React, { useState, useEffect } from 'react';
import BlobTracker from './components/BlobTracker';
import ControlPanel from './components/ControlPanel';
import { TrackerSettings, ProcessingStats, RenderState } from './types';

function App() {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  
  // Render State
  const [renderState, setRenderState] = useState<RenderState>('idle');
  const [renderProgress, setRenderProgress] = useState(0);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadExt, setDownloadExt] = useState<string>('webm');

  const [settings, setSettings] = useState<TrackerSettings>({
    threshold: 100,
    minArea: 100,
    blurSize: 5,
    historyLength: 15,
    jitter: 0.1,
    drift: 0.2,
    showHud: true,
    showTrails: true,
    showVideo: true,
    colorMode: 'solid',
    baseColor: '#00f3ff'
  });

  const [stats, setStats] = useState<ProcessingStats>({
    fps: 0,
    blobCount: 0,
    resolution: '0x0',
    renderTime: 0
  });

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      // Reset state on new upload
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
      setDownloadUrl(null);
      setRenderState('idle');
      setRenderProgress(0);
      
      setVideoFile(e.target.files[0]);
      setIsPlaying(true);
    }
  };

  const handleGenerate = () => {
    if (!videoFile) return;
    setIsPlaying(false); // Stop preview
    setRenderState('rendering');
    setRenderProgress(0);
    setDownloadUrl(null);
  };

  const handleRenderUpdate = (progress: number) => {
      // Update DOM element directly for smoother bar? Or state is fine for now
      setRenderProgress(progress);
      // We can also update a CSS variable if needed
      const bar = document.getElementById('render-bar-fill');
      if (bar) bar.style.width = `${progress}%`;
  };

  const handleRenderComplete = (blob: Blob, extension: string) => {
    setRenderState('completed');
    const url = URL.createObjectURL(blob);
    setDownloadUrl(url);
    setDownloadExt(extension);
    setIsPlaying(false); // Keep paused after render
  };

  return (
    <div className="flex w-full h-screen bg-[#050505] text-gray-200 overflow-hidden font-mono selection:bg-neon-blue selection:text-black">
      
      {/* Main Viewport */}
      <div className="flex-1 relative flex flex-col">
        {/* Decoration Bar */}
        <div className="h-10 bg-[#0c0c12] border-b border-[#1f1f2e] flex items-center px-4 justify-between text-[10px] tracking-widest text-gray-500 select-none z-10">
            <div className="flex items-center gap-6">
                <span className="flex items-center gap-2">
                    SYSTEM 
                    <span className={`w-1 h-1 rounded-full ${renderState === 'rendering' ? 'bg-orange-500' : 'bg-neon-green'}`}></span>
                </span>
                <span>MODE: {renderState === 'rendering' ? 'OFFLINE RENDER' : 'REALTIME PREVIEW'}</span>
            </div>
            <div className="opacity-50">
                VC_PRO_BUILD_2025 // OMEGA
            </div>
        </div>

        <div className="flex-1 relative bg-black flex items-center justify-center">
            {videoFile ? (
                <BlobTracker 
                    videoFile={videoFile}
                    settings={settings}
                    renderState={renderState}
                    onStatsUpdate={setStats}
                    onRenderProgress={handleRenderUpdate}
                    onRenderComplete={handleRenderComplete}
                />
            ) : (
                <div className="flex flex-col items-center justify-center text-gray-800 space-y-6">
                    <div className="w-24 h-24 border border-gray-800 rounded-full flex items-center justify-center relative group">
                         <div className="absolute inset-0 border border-neon-blue opacity-0 group-hover:opacity-100 group-hover:scale-110 transition-all duration-500 rounded-full"></div>
                         <div className="w-2 h-2 bg-gray-600 rounded-full"></div>
                    </div>
                    <div className="text-center">
                        <p className="text-xs tracking-[0.3em] uppercase text-gray-500 mb-2">System Idle</p>
                        <p className="text-[10px] text-gray-700">Awaiting Signal Input</p>
                    </div>
                </div>
            )}
        </div>
      </div>

      {/* Control Panel */}
      <ControlPanel 
        settings={settings}
        onSettingsChange={setSettings}
        stats={stats}
        renderState={renderState}
        renderProgress={renderProgress}
        onUpload={handleUpload}
        isPlaying={isPlaying}
        onTogglePlay={() => setIsPlaying(!isPlaying)}
        onGenerate={handleGenerate}
        downloadUrl={downloadUrl}
        downloadExtension={downloadExt}
      />
    </div>
  );
}

export default App;