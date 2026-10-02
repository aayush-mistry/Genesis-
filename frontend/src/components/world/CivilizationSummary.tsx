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
    if (snapshot.workplaces) {
      employed = snapshot.workplaces.reduce((sum: number, wp: any) => sum + (wp.occupiedPositions || 0), 0);
    }
    let unemployed = totalPop - employed;
    if (unemployed < 0) unemployed = 0;
    
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
    <div className="w-full h-full flex flex-col bg-slate-950/80">
      <div className="bg-slate-900/60 px-4 py-3 border-b border-slate-700/50 flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-200 tracking-wide uppercase flex items-center gap-2">
          CIVILIZATION
        </h3>
      </div>
      
      <div className="p-4 flex flex-col gap-4 flex-1 overflow-y-auto no-scrollbar">
        
        {/* Population & Employment */}
        <div className="space-y-3">
          <div className="flex justify-between items-center border-b border-slate-800 pb-2">
            <span className="text-sm text-slate-400">Population</span>
            <span className="text-lg font-mono text-slate-100">{metrics.population.toLocaleString()}</span>
          </div>
          
          <div className="flex justify-between items-center border-b border-slate-800 pb-2">
            <span className="text-sm text-slate-400">Workforce</span>
            <span className="text-lg font-mono text-slate-100">{metrics.employed > 0 ? metrics.employed.toLocaleString() : 'Data Unavailable'}</span>
          </div>

          <div className="flex justify-between items-center border-b border-slate-800 pb-2">
            <span className="text-sm text-slate-400">Employment</span>
            <span className="text-lg font-mono text-slate-100">{metrics.employed > 0 ? `${Math.round((metrics.employed / metrics.population) * 100)}%` : 'Data Unavailable'}</span>
          </div>

          <div className="flex justify-between items-center border-b border-slate-800 pb-2">
            <span className="text-sm text-slate-400">Households</span>
            <span className="text-lg font-mono text-slate-100">{metrics.households.toLocaleString()}</span>
          </div>
        </div>

        {/* Resources */}
        <div className="space-y-3 mt-2">
          <div className="flex justify-between items-center border-b border-slate-800 pb-2">
            <span className="text-sm text-slate-400">Food</span>
            <span className="text-sm font-mono text-slate-500 italic">Data Unavailable</span>
          </div>
          
          <div className="flex justify-between items-center border-b border-slate-800 pb-2">
            <span className="text-sm text-slate-400">Water</span>
            <span className="text-sm font-mono text-slate-500 italic">Data Unavailable</span>
          </div>
        </div>
      </div>
    </div>
  );
};
