import React, { useEffect } from 'react';
import { useSpatialStore } from '../../stores/useSpatialStore';
import { WorldCanvas } from './WorldCanvas';
import { EntityPanel } from './EntityPanel';

export const WorldRenderer: React.FC = () => {
  const { snapshot, isLoading, error, fetchSnapshot, resetCamera } = useSpatialStore();

  useEffect(() => {
    fetchSnapshot();
    
    // Optional: Set up a polling interval for live simulation updates
    // const intervalId = setInterval(fetchSnapshot, 5000);
    // return () => clearInterval(intervalId);
  }, []);

  if (isLoading && !snapshot) {
    return (
      <div className="flex items-center justify-center w-full h-full bg-slate-950 text-white flex-col">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500 mb-4"></div>
        <div>Loading World Spatial Data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center w-full h-full bg-slate-950 text-white flex-col">
        <div className="text-red-500 mb-2">Error Loading World</div>
        <div className="text-slate-400 mb-4">{error}</div>
        <button 
          onClick={fetchSnapshot}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded text-sm transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="flex items-center justify-center w-full h-full bg-slate-950 text-white flex-col">
        <div className="text-amber-500 mb-2">World Not Initialized</div>
        <div className="text-slate-400">Please generate a world using the admin dashboard first.</div>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col relative font-sans">
      {/* Top Bar / HUD */}
      <div className="absolute top-0 left-0 right-0 h-14 bg-slate-900/80 backdrop-blur border-b border-slate-700/50 flex items-center px-6 z-10 justify-between">
        <div className="flex items-center gap-4">
          <div className="font-bold text-xl text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-cyan-400">
            GENESIS
          </div>
          <div className="h-4 w-px bg-slate-600 mx-2"></div>
          <div className="text-slate-300 font-medium">
            {snapshot.world.name}
          </div>
        </div>
        
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-slate-400">Pop:</span>
            <span className="text-white font-mono">{snapshot.citizens.length}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-slate-400">Regions:</span>
            <span className="text-white font-mono">{snapshot.regions.length}</span>
          </div>
          <button 
            onClick={resetCamera}
            className="px-3 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded text-xs text-white transition-colors"
          >
            Reset Camera
          </button>
          <button 
            onClick={fetchSnapshot}
            className="px-3 py-1 bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 border border-indigo-500/30 rounded text-xs transition-colors"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Main Canvas Area */}
      <div className="flex-1 relative bg-slate-950">
        <WorldCanvas />
        <EntityPanel />
        
        {/* Legend */}
        <div className="absolute bottom-6 left-6 bg-slate-900/90 border border-slate-700 p-4 rounded shadow-lg backdrop-blur text-xs text-slate-300 w-48">
          <div className="font-bold text-white mb-2 uppercase tracking-wider">Legend</div>
          <div className="space-y-2">
            <div className="flex items-center gap-2"><div className="w-3 h-3 bg-[rgba(74,222,128,0.3)] border border-green-500 rounded-sm"></div> Plains</div>
            <div className="flex items-center gap-2"><div className="w-3 h-3 bg-[rgba(163,163,163,0.3)] border border-neutral-500 rounded-sm"></div> Hills</div>
            <div className="flex items-center gap-2"><div className="w-3 h-3 bg-[rgba(212,212,216,0.3)] border border-zinc-400 rounded-sm"></div> Mountains</div>
            <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-[rgba(56,189,248,0.6)]"></div> Water</div>
            <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-[rgba(34,197,94,0.6)]"></div> Forests</div>
            <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-[rgba(163,230,53,0.5)]"></div> Agriculture</div>
            <div className="flex items-center gap-2 mt-2 pt-2 border-t border-slate-700">
              <div className="w-3 h-3 border-2 border-[rgba(251,191,36,0.8)] rounded-full"></div> Minerals
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
