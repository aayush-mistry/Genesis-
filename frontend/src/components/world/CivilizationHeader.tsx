import React from 'react';
import { useSpatialStore } from '../../stores/useSpatialStore';
import { Layers, Map, Users } from 'lucide-react';
import { EntitySearch } from './EntitySearch';

export const CivilizationHeader: React.FC = () => {
  const { snapshot, layers, toggleLayer, resetCamera, liveTime, liveSimulationState, liveSpeed } = useSpatialStore();

  if (!snapshot) return null;

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
        <div className="flex items-center gap-4 bg-slate-950/50 px-4 py-1.5 rounded-lg border border-slate-800">
           <div className="flex flex-col items-end">
             <div className="text-xs text-slate-400 uppercase tracking-widest font-semibold">Simulation</div>
             <div className={`text-sm font-bold ${liveSimulationState === 'Running' ? 'text-emerald-400' : 'text-amber-400'}`}>
               {liveSimulationState} {liveSpeed > 1 && `(${liveSpeed}x)`}
             </div>
           </div>
           {liveTime && (
             <>
               <div className="h-6 w-px bg-slate-700"></div>
               <div className="flex flex-col text-right">
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
