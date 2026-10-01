import React from 'react';
import { useSpatialStore } from '../../stores/useSpatialStore';
import { Layers, Map, Users, Play, Pause, FastForward } from 'lucide-react';
import { EntitySearch } from './EntitySearch';
import { timeApi } from '../../api/time';

export const CivilizationHeader: React.FC = () => {
  const { snapshot, layers, toggleLayer, resetCamera, liveTime, liveSimulationState, liveSpeed, mapMode, setMapMode } = useSpatialStore();

  if (!snapshot) return null;

  const handleTogglePlay = async () => {
    try {
      if (liveSimulationState === 'Running') {
        await timeApi.pause();
      } else if (liveSimulationState === 'Stopped' || liveSimulationState === 'Reset') {
        await timeApi.start();
      } else {
        await timeApi.resume();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSpeedChange = async (speed: number) => {
    try {
      await timeApi.setSpeed(speed);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="absolute top-0 left-0 right-0 h-16 bg-slate-900/90 backdrop-blur border-b border-slate-700/50 flex items-center px-6 z-20 justify-between shadow-md">
      {/* Brand & Map Name */}
      <div className="flex items-center gap-4">
        <div className="font-bold text-2xl tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-cyan-400 flex items-center gap-2">
          <Map className="w-6 h-6 text-indigo-400" />
          GENESIS
        </div>
        <div className="h-6 w-px bg-slate-700 mx-2"></div>
        <div className="flex flex-col">
          <div className="text-slate-200 font-semibold text-sm uppercase tracking-wide">
            {snapshot.world.name}
          </div>
          <div className="text-xs text-slate-500 font-mono">
            {snapshot.regions.length} Region{snapshot.regions.length !== 1 && 's'} · {snapshot.cities.length} Cit{snapshot.cities.length === 1 ? 'y' : 'ies'} · {snapshot.districts.length} District{snapshot.districts.length !== 1 && 's'}
          </div>
        </div>
      </div>
      
      {/* Search Bar */}
      <div className="flex-1 max-w-md mx-6">
        <EntitySearch />
      </div>
      
      {/* Global State & Controls */}
      <div className="flex items-center gap-6">
        
        {/* Simulation State */}
        <div className="flex items-center gap-3 bg-slate-950/50 pl-4 pr-2 py-1.5 rounded-lg border border-slate-800">
           <div className="flex flex-col items-end">
             <div className="text-xs text-slate-400 uppercase tracking-widest font-semibold">Simulation</div>
             <div className={`text-sm font-bold ${liveSimulationState === 'Running' ? 'text-emerald-400' : 'text-amber-400'}`}>
               {liveSimulationState} {liveSpeed > 1 && `(${liveSpeed}x)`}
             </div>
           </div>

           <div className="flex items-center gap-1 ml-2 border-l border-slate-700 pl-3">
             <button onClick={handleTogglePlay} className="p-1.5 rounded-md hover:bg-slate-800 text-slate-300 hover:text-white transition-colors">
               {liveSimulationState === 'Running' ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
             </button>
             
             <div className="group relative">
                <button 
                  onClick={() => {
                    const speeds = [1, 2, 5, 10];
                    const nextSpeed = speeds[(speeds.indexOf(liveSpeed) + 1) % speeds.length] || 1;
                    handleSpeedChange(nextSpeed);
                  }}
                  className="p-1.5 rounded-md hover:bg-slate-800 text-slate-300 hover:text-white transition-colors flex items-center"
                  title="Click to cycle speed, or hover for options"
                >
                  <FastForward className="w-4 h-4" />
                </button>
                <div className="absolute right-0 top-full pt-1 w-32 z-50 hidden group-hover:block">
                  <div className="bg-slate-800 border border-slate-700 rounded-md shadow-xl p-1">
                    <div className="text-[10px] font-bold text-slate-400 uppercase mb-1 px-2 pt-1">Speed</div>
                    {[1, 2, 5, 10].map(s => (
                      <button 
                        key={s} 
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSpeedChange(s);
                        }} 
                        className={`w-full text-left px-2 py-1.5 rounded text-xs transition-colors ${liveSpeed === s ? 'bg-indigo-600 text-white font-medium' : 'text-slate-300 hover:bg-slate-700'}`}
                      >
                        {s}x Speed
                      </button>
                    ))}
                  </div>
                </div>
             </div>
           </div>

           {liveTime && (
             <>
               <div className="h-6 w-px bg-slate-700 mx-1"></div>
               <div className="flex flex-col text-right pr-2">
                 <div className="text-xs text-slate-400">Day {liveTime.day || 0}</div>
                 <div className="text-sm font-mono text-slate-200">
                   {String(liveTime.hour || 0).padStart(2, '0')}:{String(liveTime.minute || 0).padStart(2, '0')}
                 </div>
               </div>
             </>
           )}
        </div>

        {/* Population */}
        <div className="flex items-center gap-2 bg-slate-950/50 px-3 py-1.5 rounded-lg border border-slate-800">
          <Users className="w-4 h-4 text-cyan-500" />
          <div className="flex flex-col">
            <span className="text-[10px] text-slate-400 uppercase leading-none">Population</span>
            <span className="text-sm text-white font-mono leading-tight">{snapshot.citizens.length.toLocaleString()}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {/* Map Mode Selector */}
          <div className="group relative">
            <button className="flex items-center gap-2 px-3 h-9 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-md text-slate-300 transition-colors">
              <span className="text-xs font-semibold">{mapMode}</span>
            </button>
            <div className="absolute right-0 top-full mt-2 w-36 bg-slate-800 border border-slate-700 rounded-md shadow-xl hidden group-hover:block p-2 z-50">
              <div className="text-[10px] font-bold text-slate-400 uppercase mb-2 px-2">Map Mode</div>
              {['NORMAL', 'POPULATION', 'RESOURCES', 'ECONOMY', 'ACTIVITY'].map(mode => (
                <button 
                  key={mode} 
                  onClick={() => setMapMode(mode as any)}
                  className={`w-full text-left px-2 py-1.5 rounded text-sm mb-1 transition-colors ${mapMode === mode ? 'bg-indigo-600 text-white font-medium' : 'text-slate-300 hover:bg-slate-700'}`}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>

          {/* Layer Controls Dropdown */}
          <div className="group relative">
            <button className="flex items-center justify-center w-9 h-9 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-md text-slate-300 transition-colors tooltip-trigger">
              <Layers size={18} />
            </button>
            <div className="absolute right-0 top-full mt-2 w-48 bg-slate-800 border border-slate-700 rounded-md shadow-xl hidden group-hover:block p-2 z-50">
              <div className="text-xs font-bold text-slate-400 uppercase mb-2 px-2">Map Layers</div>
              <label className="flex items-center gap-3 px-2 py-1.5 hover:bg-slate-700 cursor-pointer text-sm text-slate-200 rounded">
                <input type="checkbox" checked={layers.citizens} onChange={() => toggleLayer('citizens')} className="rounded border-slate-600 bg-slate-900 text-indigo-500 focus:ring-indigo-500 w-4 h-4" />
                Citizens
              </label>
              <label className="flex items-center gap-3 px-2 py-1.5 hover:bg-slate-700 cursor-pointer text-sm text-slate-200 rounded">
                <input type="checkbox" checked={layers.buildings} onChange={() => toggleLayer('buildings')} className="rounded border-slate-600 bg-slate-900 text-indigo-500 focus:ring-indigo-500 w-4 h-4" />
                Infrastructure
              </label>
              <label className="flex items-center gap-3 px-2 py-1.5 hover:bg-slate-700 cursor-pointer text-sm text-slate-200 rounded">
                <input type="checkbox" checked={layers.resources} onChange={() => toggleLayer('resources')} className="rounded border-slate-600 bg-slate-900 text-indigo-500 focus:ring-indigo-500 w-4 h-4" />
                Resources
              </label>
              <label className="flex items-center gap-3 px-2 py-1.5 hover:bg-slate-700 cursor-pointer text-sm text-slate-200 rounded">
                <input type="checkbox" checked={layers.terrain} onChange={() => toggleLayer('terrain')} className="rounded border-slate-600 bg-slate-900 text-indigo-500 focus:ring-indigo-500 w-4 h-4" />
                Terrain
              </label>
            </div>
          </div>
          
          <button 
            onClick={resetCamera}
            title="Reset Camera"
            className="flex items-center justify-center w-9 h-9 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-md text-slate-300 transition-colors"
          >
            <Map size={18} />
          </button>
        </div>
      </div>
    </div>
  );
};
