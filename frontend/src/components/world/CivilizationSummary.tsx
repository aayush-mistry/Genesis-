import React, { useEffect, useMemo } from 'react';
import { useSpatialStore } from '../../stores/useSpatialStore';

export const CivilizationSummary: React.FC = () => {
  const { summary, fetchSummary } = useSpatialStore();

  useEffect(() => {
    fetchSummary();
    const interval = setInterval(fetchSummary, 5000);
    return () => clearInterval(interval);
  }, [fetchSummary]);

  const formatQuantity = (quantity: number, unit: string) => {
    if (quantity === undefined || quantity === null) return 'Data Unavailable';
    if (quantity === 0) return `0 ${unit}`;
    
    if (unit === 'kg' && quantity >= 1000) {
      return `${(quantity / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })} t`;
    }
    if (unit === 'L' && quantity >= 1000) {
      return `${(quantity / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })}k L`;
    }
    return `${quantity.toLocaleString()} ${unit}`;
  };

  if (!summary) return null;

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
            <span className="text-lg font-mono text-slate-100">{summary.population.toLocaleString()}</span>
          </div>
          
          <div className="flex justify-between items-center border-b border-slate-800 pb-2">
            <span className="text-sm text-slate-400">Workforce</span>
            <span className="text-lg font-mono text-slate-100">{summary.employment.workforce > 0 ? summary.employment.workforce.toLocaleString() : '0'}</span>
          </div>

          <div className="flex justify-between items-center border-b border-slate-800 pb-2">
            <span className="text-sm text-slate-400">Employed</span>
            <span className="text-lg font-mono text-slate-100">{summary.employment.employed.toLocaleString()}</span>
          </div>
          
          <div className="flex justify-between items-center border-b border-slate-800 pb-2">
            <span className="text-sm text-slate-400">Unemployed</span>
            <span className="text-lg font-mono text-slate-100">{summary.employment.unemployed.toLocaleString()}</span>
          </div>
        </div>

        {/* Resources */}
        <div className="space-y-3 mt-2">
          <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">RESOURCES</h4>
          <div className="flex justify-between items-center border-b border-slate-800 pb-2">
            <span className="text-sm text-slate-400">Food</span>
            <span className="text-sm font-mono text-emerald-400">{formatQuantity(summary.resources?.food?.quantity, summary.resources?.food?.unit)}</span>
          </div>
          
          <div className="flex justify-between items-center border-b border-slate-800 pb-2">
            <span className="text-sm text-slate-400">Water</span>
            <span className="text-sm font-mono text-blue-400">{formatQuantity(summary.resources?.water?.quantity, summary.resources?.water?.unit)}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
