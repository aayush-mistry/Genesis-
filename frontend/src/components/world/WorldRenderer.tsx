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
      <div className="flex items-center justify-center w-full h-full bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-slate-900 via-[#0a0a0a] to-black text-white flex-col relative overflow-hidden">
        {/* Decorative Background Elements */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-indigo-500/10 rounded-full blur-[100px]" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-purple-500/10 rounded-full blur-[80px]" />
        </div>

        {/* Content Card */}
        <div className="relative z-10 flex flex-col items-center justify-center p-12 rounded-2xl border border-white/5 bg-white/5 backdrop-blur-xl shadow-2xl overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 to-purple-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
          
          <div className="w-24 h-24 mb-6 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 p-[1px] shadow-lg">
            <div className="w-full h-full bg-[#0a0a0a] rounded-2xl flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-10 h-10 text-indigo-400 group-hover:scale-110 transition-transform duration-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
                <path d="M2 12h20" />
              </svg>
            </div>
          </div>

          <h2 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-200 to-purple-200 mb-3 text-center tracking-tight">
            World Not Initialized
          </h2>
          <p className="text-slate-400 text-center max-w-sm mb-8 leading-relaxed">
            The Genesis Engine is currently dormant. Initialize a new world to begin the spatial simulation.
          </p>

          <a 
            href="/inspector"
            className="group/btn relative inline-flex items-center justify-center px-8 py-3.5 text-sm font-semibold text-white transition-all duration-300 ease-in-out bg-indigo-600 rounded-full hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-[#0a0a0a] shadow-[0_0_20px_rgba(79,70,229,0.3)] hover:shadow-[0_0_30px_rgba(79,70,229,0.5)] overflow-hidden"
          >
            <span className="absolute inset-0 w-full h-full -mt-1 rounded-lg opacity-30 bg-gradient-to-b from-transparent via-transparent to-black" />
            <span className="relative flex items-center gap-2">
              Open Admin Dashboard
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 group-hover/btn:translate-x-1 transition-transform duration-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14" />
                <path d="m12 5 7 7-7 7" />
              </svg>
            </span>
          </a>
        </div>
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
