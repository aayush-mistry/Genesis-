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
      <CivilizationHeader />

      <div className="flex-1 relative w-full h-full">
        <WorldCanvas />

        {/* Left Overlay: Civilization Summary */}
        <div className="absolute top-4 left-4 w-72 max-h-[calc(100%-6rem)] flex flex-col gap-4 pointer-events-none z-10">
          <div className="pointer-events-auto shadow-2xl rounded-lg overflow-hidden border border-slate-700/50 bg-slate-900/80 backdrop-blur-md">
            <CivilizationSummary />
          </div>
        </div>

        {/* Right Overlay: Inspector */}
        <div className="absolute top-4 right-4 w-80 max-h-[calc(100%-6rem)] flex flex-col gap-4 pointer-events-none z-10">
          <div className="pointer-events-auto shadow-2xl rounded-lg overflow-hidden border border-slate-700/50 bg-slate-900/80 backdrop-blur-md flex-1">
            <EntityPanel />
          </div>
        </div>

        {/* Bottom Overlay: Activity & Controls */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-full max-w-4xl pointer-events-none z-10">
          <div className="pointer-events-auto shadow-2xl rounded-lg overflow-hidden border border-slate-700/50 bg-slate-900/80 backdrop-blur-md">
            <ActivityFeed />
          </div>
        </div>
      </div>
    </div>
  );
};
