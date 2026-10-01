import React, { useEffect } from 'react';
import { useSpatialStore } from '../../stores/useSpatialStore';
import { WorldCanvas } from './WorldCanvas';
import { EntityPanel } from './EntityPanel';
import { CivilizationHeader } from './CivilizationHeader';
import { CivilizationSummary } from './CivilizationSummary';
import { ActivityFeed } from './ActivityFeed';

export const WorldRenderer: React.FC = () => {
  const { snapshot, isLoading, error, fetchSnapshot } = useSpatialStore();

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
    <div className="w-full h-full flex flex-col relative font-sans overflow-hidden bg-slate-950">
      {/* Top Bar / HUD */}
      <CivilizationHeader />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-row overflow-hidden pt-16">
        
        {/* Left Sidebar */}
        <div className="w-80 flex-shrink-0 flex flex-col border-r border-slate-800/60 bg-slate-900/50 backdrop-blur z-10 overflow-y-auto no-scrollbar">
          <CivilizationSummary />
          
          {/* Legend */}
          <div className="bg-slate-900/90 border-t border-slate-700/80 p-4 shadow-lg flex-shrink-0 text-xs text-slate-300">
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

        {/* Center Canvas Area */}
        <div className="flex-1 relative bg-slate-950">
          <WorldCanvas />
        </div>
        
        {/* Right Sidebar */}
        <div className="w-80 flex-shrink-0 flex flex-col border-l border-slate-800/60 bg-slate-900/50 backdrop-blur z-10 overflow-hidden">
          <ActivityFeed />
          <div className="flex-1 flex flex-col overflow-hidden relative">
             <EntityPanel />
          </div>
        </div>
        
      </div>
    </div>
  );
};
