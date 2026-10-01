import React, { useMemo } from 'react';
import { useSpatialStore } from '../../stores/useSpatialStore';
import { Activity, Briefcase, Droplets, Wheat, Home, Hammer } from 'lucide-react';

export const CivilizationSummary: React.FC = () => {
  const { snapshot, dynamicState, selection } = useSpatialStore();

  const metrics = useMemo(() => {
    if (!snapshot) return null;
    
    // Calculate employment metrics from snapshot if possible
    // Note: detailed employment might require an aggregated backend API
    const totalPop = snapshot.citizens.length;
    let employed = 0;
    let unemployed = totalPop;
    
    // In a full implementation, we'd iterate over citizens to check employment
    // For now, if dynamicState has aggregated metrics, use them, otherwise fallback to snapshot approximations
    
    return {
      population: totalPop,
      employed,
      unemployed,
      households: snapshot.citizens.filter((c: any) => c.householdId).length,
      workplaces: snapshot.buildings.filter((b: any) => 
        ['FACTORY', 'OFFICE', 'STORE', 'FARM'].includes(b.type)
      ).length
    };
  }, [snapshot, dynamicState]);

  if (!snapshot || !metrics) return null;

  return (
    <div className={`absolute top-24 w-80 bg-slate-900/90 border border-slate-700/80 rounded-xl shadow-2xl backdrop-blur-md flex flex-col overflow-hidden z-10 transition-all duration-300 ease-in-out ${selection ? 'right-[340px]' : 'right-6'}`}>
      <div className="bg-slate-800/80 px-4 py-3 border-b border-slate-700 flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-200 tracking-wide uppercase flex items-center gap-2">
          <Activity className="w-4 h-4 text-indigo-400" />
          Civilization Status
        </h3>
      </div>
      
      <div className="p-4 flex flex-col gap-6 max-h-[calc(100vh-200px)] overflow-y-auto custom-scrollbar">
        
        {/* Population & Employment */}
        <div className="space-y-3">
          <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Demographics</h4>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-950/50 p-3 rounded-lg border border-slate-800/50">
              <div className="text-xs text-slate-400 mb-1 flex items-center gap-1.5"><Home className="w-3.5 h-3.5 text-blue-400" /> Population</div>
              <div className="text-xl font-mono text-slate-100">{metrics.population}</div>
            </div>
            <div className="bg-slate-950/50 p-3 rounded-lg border border-slate-800/50">
              <div className="text-xs text-slate-400 mb-1 flex items-center gap-1.5"><Briefcase className="w-3.5 h-3.5 text-emerald-400" /> Workforce</div>
              <div className="text-xl font-mono text-slate-100">{metrics.employed}</div>
            </div>
          </div>
          {/* Progress bar for employment */}
          <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
            <div className="bg-emerald-500 h-full" style={{ width: `${metrics.population > 0 ? (metrics.employed / metrics.population) * 100 : 0}%` }}></div>
          </div>
          <div className="flex justify-between text-[10px] text-slate-500 font-medium">
            <span>{metrics.employed} Employed</span>
            <span>{metrics.unemployed} Unemployed</span>
          </div>
        </div>

        <div className="h-px w-full bg-slate-800"></div>

        {/* Vital Resources */}
        <div className="space-y-3">
          <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Strategic Resources</h4>
          <div className="space-y-2">
            <div className="flex items-center justify-between p-2 rounded hover:bg-slate-800/50 transition-colors">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded bg-amber-500/20 flex items-center justify-center">
                  <Wheat className="w-3.5 h-3.5 text-amber-400" />
                </div>
                <span className="text-sm text-slate-300">Food Supply</span>
              </div>
              <span className="text-sm font-mono text-white">-- kg</span>
            </div>
            <div className="flex items-center justify-between p-2 rounded hover:bg-slate-800/50 transition-colors">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded bg-cyan-500/20 flex items-center justify-center">
                  <Droplets className="w-3.5 h-3.5 text-cyan-400" />
                </div>
                <span className="text-sm text-slate-300">Water Supply</span>
              </div>
              <span className="text-sm font-mono text-white">-- L</span>
            </div>
          </div>
        </div>

        <div className="h-px w-full bg-slate-800"></div>

        {/* Infrastructure */}
        <div className="space-y-3">
          <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Infrastructure</h4>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-950/50 p-3 rounded-lg border border-slate-800/50 flex flex-col items-center justify-center">
               <Home className="w-5 h-5 text-indigo-400 mb-1" />
               <div className="text-lg font-mono text-slate-200">{metrics.households}</div>
               <div className="text-[10px] text-slate-500 uppercase">Households</div>
            </div>
            <div className="bg-slate-950/50 p-3 rounded-lg border border-slate-800/50 flex flex-col items-center justify-center">
               <Hammer className="w-5 h-5 text-orange-400 mb-1" />
               <div className="text-lg font-mono text-slate-200">{metrics.workplaces}</div>
               <div className="text-[10px] text-slate-500 uppercase">Workplaces</div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
