import React from 'react';
import { TrackerSettings, ProcessingStats, RenderState, ColorMode } from '../types';

interface ControlPanelProps {
  settings: TrackerSettings;
  onSettingsChange: (s: TrackerSettings) => void;
  stats: ProcessingStats;
  renderState: RenderState;
  renderProgress: number;
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onGenerate: () => void;
  downloadUrl: string | null;
  downloadExtension: string;
}

const ControlPanel: React.FC<ControlPanelProps> = ({
  settings,
  onSettingsChange,
  stats,
  renderState,
  renderProgress,
  onUpload,
  isPlaying,
  onTogglePlay,
  onGenerate,
  downloadUrl,
  downloadExtension
}) => {
  const handleChange = (key: keyof TrackerSettings, value: any) => {
    onSettingsChange({ ...settings, [key]: value });
  };

  const isRendering = renderState === 'rendering';

  return (
    <div className="w-80 flex-shrink-0 bg-[#08080c] border-l border-[#1f1f2e] flex flex-col h-full font-mono text-xs select-none shadow-xl z-20">
      
      {/* Header */}
      <div className="p-4 border-b border-[#1f1f2e] bg-[#0c0c12]">
        <h1 className="text-lg font-bold text-gray-200 tracking-[0.2em] mb-1">
          VISION<span className="text-neon-blue">CORE</span>
        </h1>
        <div className="flex items-center gap-2 text-[10px]">
           <div className={`w-2 h-2 rounded-full ${stats.fps > 0 ? 'bg-neon-green animate-pulse' : 'bg-red-500'}`}></div>
           <span className="text-gray-500">SYSTEM {stats.fps > 0 ? 'ONLINE' : 'STANDBY'}</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-6">
        
        {/* SECTION: INPUT */}
        <section className="space-y-3">
          <h3 className="text-neon-blue font-bold tracking-wider opacity-80 mb-2">I. SOURCE</h3>
          
          <label className={`block p-4 border border-dashed border-gray-700 hover:border-neon-blue hover:bg-neon-blue/5 transition-all cursor-pointer rounded text-center ${isRendering ? 'opacity-50 pointer-events-none' : ''}`}>
             <span className="text-gray-400">UPLOAD FOOTAGE</span>
             <input type="file" accept="video/mp4,video/quicktime,video/webm" onChange={onUpload} className="hidden" disabled={isRendering} />
          </label>

          <button 
             onClick={onTogglePlay}
             disabled={isRendering}
             className={`w-full py-3 border font-bold tracking-wide transition-all rounded ${
               isPlaying 
                 ? 'border-neon-blue bg-neon-blue/10 text-white shadow-[0_0_10px_rgba(0,243,255,0.2)]' 
                 : 'border-gray-700 bg-[#11111a] text-gray-500 hover:text-white'
             }`}
          >
            {isPlaying ? 'PAUSE PREVIEW' : 'RESUME PREVIEW'}
          </button>
        </section>

        {/* SECTION: TRACKING */}
        <section className="space-y-4">
          <h3 className="text-neon-blue font-bold tracking-wider opacity-80 border-b border-gray-800 pb-1">II. TRACKING</h3>
          
          {/* Threshold */}
          <div>
            <div className="flex justify-between mb-1 text-gray-400">
              <span>THRESHOLD</span>
              <span>{settings.threshold}</span>
            </div>
            <input 
              type="range" min="0" max="255" 
              value={settings.threshold}
              onChange={(e) => handleChange('threshold', Number(e.target.value))}
              disabled={isRendering}
              className="range-input w-full"
            />
          </div>

          {/* Min Area */}
          <div>
            <div className="flex justify-between mb-1 text-gray-400">
              <span>MIN SIZE</span>
              <span>{settings.minArea}px</span>
            </div>
            <input 
              type="range" min="10" max="10000" step="50"
              value={settings.minArea}
              onChange={(e) => handleChange('minArea', Number(e.target.value))}
              disabled={isRendering}
              className="range-input w-full"
            />
          </div>

           {/* Blur */}
           <div>
            <div className="flex justify-between mb-1 text-gray-400">
              <span>SMOOTHING</span>
              <span>{settings.blurSize}</span>
            </div>
            <input 
              type="range" min="1" max="31" step="2"
              value={settings.blurSize}
              onChange={(e) => handleChange('blurSize', Number(e.target.value))}
              disabled={isRendering}
              className="range-input w-full"
            />
          </div>
        </section>

        {/* SECTION: ORGANIC */}
        <section className="space-y-4">
           <h3 className="text-neon-blue font-bold tracking-wider opacity-80 border-b border-gray-800 pb-1">III. BEHAVIOR</h3>
           
           {/* Jitter */}
           <div>
            <div className="flex justify-between mb-1 text-gray-400">
              <span>NOISE / JITTER</span>
              <span>{(settings.jitter * 100).toFixed(0)}%</span>
            </div>
            <input 
              type="range" min="0" max="1" step="0.01"
              value={settings.jitter}
              onChange={(e) => handleChange('jitter', Number(e.target.value))}
              disabled={isRendering}
              className="range-input w-full"
            />
          </div>

          {/* Drift */}
          <div>
            <div className="flex justify-between mb-1 text-gray-400">
              <span>DRIFT / LAG</span>
              <span>{(settings.drift * 100).toFixed(0)}%</span>
            </div>
            <input 
              type="range" min="0" max="1" step="0.01"
              value={settings.drift}
              onChange={(e) => handleChange('drift', Number(e.target.value))}
              disabled={isRendering}
              className="range-input w-full"
            />
          </div>
          
           {/* History */}
           <div>
            <div className="flex justify-between mb-1 text-gray-400">
              <span>TRAIL LENGTH</span>
              <span>{settings.historyLength}</span>
            </div>
            <input 
              type="range" min="0" max="50"
              value={settings.historyLength}
              onChange={(e) => handleChange('historyLength', Number(e.target.value))}
              disabled={isRendering}
              className="range-input w-full"
            />
          </div>
        </section>

        {/* SECTION: VISUALS */}
        <section className="space-y-4">
          <h3 className="text-neon-blue font-bold tracking-wider opacity-80 border-b border-gray-800 pb-1">IV. VISUALS</h3>
          
          <div className="grid grid-cols-2 gap-2">
            <button 
                onClick={() => handleChange('showVideo', !settings.showVideo)}
                className={`py-2 px-3 text-center border rounded transition-colors ${settings.showVideo ? 'border-gray-500 bg-gray-800 text-white' : 'border-gray-800 text-gray-600'}`}
            >
                VIDEO: {settings.showVideo ? 'ON' : 'OFF'}
            </button>
             <button 
                onClick={() => handleChange('showTrails', !settings.showTrails)}
                className={`py-2 px-3 text-center border rounded transition-colors ${settings.showTrails ? 'border-gray-500 bg-gray-800 text-white' : 'border-gray-800 text-gray-600'}`}
            >
                TRAILS: {settings.showTrails ? 'ON' : 'OFF'}
            </button>
          </div>

          <div className="space-y-2">
            <span className="text-gray-400 block mb-2">COLOR MODE</span>
            <div className="flex rounded border border-gray-700 overflow-hidden">
                {(['solid', 'cycle', 'random'] as ColorMode[]).map(mode => (
                    <button
                        key={mode}
                        onClick={() => handleChange('colorMode', mode)}
                        className={`flex-1 py-2 text-center hover:text-white transition-colors ${settings.colorMode === mode ? 'bg-neon-blue text-black font-bold' : 'bg-[#11111a] text-gray-500'}`}
                    >
                        {mode.toUpperCase()}
                    </button>
                ))}
            </div>
            
            {settings.colorMode === 'solid' && (
                <div className="flex items-center gap-3 pt-2">
                    <input 
                        type="color" 
                        value={settings.baseColor}
                        onChange={(e) => handleChange('baseColor', e.target.value)}
                        className="w-8 h-8 rounded bg-transparent border-none cursor-pointer"
                    />
                    <span className="text-gray-400 uppercase">{settings.baseColor}</span>
                </div>
            )}
          </div>
        </section>
      </div>

      {/* FOOTER: GENERATE */}
      <div className="p-4 border-t border-[#1f1f2e] bg-[#0c0c12] space-y-3">
        {isRendering ? (
             <div className="space-y-2">
                 <div className="flex justify-between text-neon-blue animate-pulse">
                     <span>RENDERING...</span>
                     <span>{renderProgress}%</span>
                 </div>
                 <div className="w-full bg-gray-800 h-1 rounded overflow-hidden">
                     <div className="bg-neon-blue h-full transition-all duration-300" style={{width: `${renderProgress}%`}}></div>
                 </div>
             </div>
        ) : (
            <>
                {downloadUrl ? (
                    <a 
                        href={downloadUrl} 
                        download={`visioncore_export_${Date.now()}.${downloadExtension}`}
                        className="block w-full py-4 bg-neon-green text-black font-bold text-center tracking-widest hover:bg-white transition-colors rounded shadow-[0_0_15px_rgba(10,255,0,0.3)]"
                    >
                        DOWNLOAD EXPORT ({downloadExtension.toUpperCase()})
                    </a>
                ) : (
                    <button 
                        onClick={onGenerate}
                        className="block w-full py-4 bg-neon-blue text-black font-bold tracking-widest hover:bg-white transition-colors rounded shadow-[0_0_15px_rgba(0,243,255,0.3)] disabled:opacity-50 disabled:cursor-not-allowed"
                        disabled={stats.renderTime === 0 && !isPlaying} // Disable if no video loaded roughly
                    >
                        GENERATE OUTPUT
                    </button>
                )}
            </>
        )}
      </div>

       {/* Stats Footer */}
       <div className="px-4 py-2 bg-black text-[10px] text-gray-600 flex justify-between font-mono">
           <span>{stats.resolution}</span>
           <span>{stats.renderTime.toFixed(1)}ms / {stats.blobCount} OBJ</span>
       </div>

       <style>{`
          .range-input {
            -webkit-appearance: none;
            background: #1f1f2e;
            height: 4px;
            border-radius: 2px;
            outline: none;
          }
          .range-input::-webkit-slider-thumb {
            -webkit-appearance: none;
            width: 12px;
            height: 12px;
            border-radius: 50%;
            background: #00f3ff;
            cursor: pointer;
            box-shadow: 0 0 5px #00f3ff;
          }
       `}</style>
    </div>
  );
};

export default ControlPanel;