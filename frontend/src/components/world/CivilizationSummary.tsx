import React, { useEffect, useState } from 'react';
import { useSpatialStore } from '../../stores/useSpatialStore';

export const CivilizationSummary: React.FC = () => {
  const { summary, fetchSummary } = useSpatialStore();
  const [error, setError] = useState<boolean>(false);

  useEffect(() => {
    const doFetch = async () => {
      try {
        await fetchSummary();
        setError(false);
      } catch (e) {
        setError(true);
      }
    };
    doFetch();
    const interval = setInterval(doFetch, 5000);
    return () => clearInterval(interval);
  }, [fetchSummary]);

  const formatQuantity = (quantity: number | undefined | null, unit: string) => {
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

  const formatMoney = (amount: number | undefined | null) => {
    if (amount === undefined || amount === null) return 'Data Unavailable';
    if (amount === 0) return '0 GEN';
    if (amount >= 1000000) return `${(amount / 1000000).toLocaleString(undefined, { maximumFractionDigits: 1 })}M GEN`;
    if (amount >= 1000) return `${(amount / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })}k GEN`;
    return `${amount.toLocaleString()} GEN`;
  };

  if (error) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-slate-950/80">
        <span className="text-red-500 font-mono text-sm">Connection Error</span>
      </div>
    );
  }

  if (!summary) return null;

  const pop = typeof summary.population === 'number' ? summary.population : summary.population?.total;

  return (
    <div className="w-full h-full flex flex-col bg-slate-950/80">
      <div className="bg-slate-900/60 px-4 py-3 border-b border-slate-700/50 flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-200 tracking-wide uppercase flex items-center gap-2">
          CIVILIZATION
        </h3>
      </div>
      
      <div className="p-4 flex flex-col gap-4 flex-1 overflow-y-auto no-scrollbar">
        
        {/* Civilization */}
        <div className="space-y-3">
          <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">CIVILIZATION</h4>
          <div className="flex justify-between items-center border-b border-slate-800 pb-2">
            <span className="text-sm text-slate-400">Population</span>
            <span className="text-sm font-mono text-slate-100">{pop !== undefined ? pop.toLocaleString() : 'Data Unavailable'}</span>
          </div>
          
          <div className="flex justify-between items-center border-b border-slate-800 pb-2">
            <span className="text-sm text-slate-400">Workforce</span>
            <span className="text-sm font-mono text-slate-100">{summary.employment?.workforce !== undefined ? summary.employment.workforce.toLocaleString() : 'Data Unavailable'}</span>
          </div>

          <div className="flex justify-between items-center border-b border-slate-800 pb-2">
            <span className="text-sm text-slate-400">Employment</span>
            <span className="text-sm font-mono text-slate-100">
              {summary.employment?.workforce > 0 
                ? `${Math.round((summary.employment.employed / summary.employment.workforce) * 100)}%` 
                : '0%'}
            </span>
          </div>
        </div>

        {/* Resources */}
        <div className="space-y-3 mt-2">
          <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">RESOURCES</h4>
          <div className="flex justify-between items-center border-b border-slate-800 pb-2">
            <span className="text-sm text-slate-400">Food Inventory</span>
            <span className="text-sm font-mono text-emerald-400">{formatQuantity(summary.resources?.food?.quantity, summary.resources?.food?.unit)}</span>
          </div>
          
          <div className="flex justify-between items-center border-b border-slate-800 pb-2">
            <span className="text-sm text-slate-400">Daily Hunger Demand</span>
            <span className="text-sm font-mono text-orange-400">{formatQuantity(summary.resources?.food?.dailyHungerDemand, 'hunger')}</span>
          </div>
          
          <div className="flex justify-between items-center border-b border-slate-800 pb-2">
            <span className="text-sm text-slate-400">Water Inventory</span>
            <span className="text-sm font-mono text-blue-400">{formatQuantity(summary.resources?.water?.quantity, summary.resources?.water?.unit)}</span>
          </div>

          <div className="flex justify-between items-center border-b border-slate-800 pb-2">
            <span className="text-sm text-slate-400">Daily Thirst Demand</span>
            <span className="text-sm font-mono text-orange-400">{formatQuantity(summary.resources?.water?.dailyThirstDemand, 'thirst')}</span>
          </div>
        </div>

        {/* Economy */}
        {summary.production && summary.finance && (
          <div className="space-y-3 mt-2">
            <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">ECONOMY</h4>
            
            <div className="flex justify-between items-center border-b border-slate-800 pb-2">
              <span className="text-sm text-slate-400">Active Producers</span>
              <span className="text-sm font-mono text-slate-100">{summary.production.activeProducers ?? '0'}</span>
            </div>

            <div className="flex justify-between items-center border-b border-slate-800 pb-2">
              <span className="text-sm text-slate-400">Commerce Outlets</span>
              <span className="text-sm font-mono text-slate-100">{summary.commerce?.activeStores ?? '0'}</span>
            </div>
            
            <div className="flex justify-between items-center border-b border-slate-800 pb-2">
              <span className="text-sm text-slate-400">Total Money</span>
              <span className="text-sm font-mono text-yellow-400">{formatMoney(summary.finance.totalMoney)}</span>
            </div>
          </div>
        )}

        {/* Macroeconomics: Demand & Supply */}
        {summary.demand && summary.supply && (
          <div className="space-y-3 mt-2">
            <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">MACROECONOMICS (FOOD)</h4>
            
            <div className="flex justify-between items-center border-b border-slate-800 pb-2">
              <span className="text-sm text-slate-400">Demand (Purchased)</span>
              <span className="text-sm font-mono text-emerald-400">{formatQuantity(summary.demand.food?.purchased, summary.demand.food?.unit)}</span>
            </div>

            <div className="flex justify-between items-center border-b border-slate-800 pb-2">
              <span className="text-sm text-slate-400">Unmet Demand</span>
              <span className="text-sm font-mono text-red-400">{formatQuantity(summary.demand.food?.unmet, summary.demand.food?.unit)}</span>
            </div>
            
            <div className="flex justify-between items-center border-b border-slate-800 pb-2">
              <span className="text-sm text-slate-400">Retail Supply</span>
              <span className="text-sm font-mono text-blue-400">{formatQuantity(summary.supply.food?.retailSupply, summary.supply.food?.unit)}</span>
            </div>

            <div className="flex justify-between items-center border-b border-slate-800 pb-2">
              <span className="text-sm text-slate-400">Wholesale Supply</span>
              <span className="text-sm font-mono text-blue-400">{formatQuantity(summary.supply.food?.wholesaleSupply, summary.supply.food?.unit)}</span>
            </div>

            <div className="flex justify-between items-center border-b border-slate-800 pb-2">
              <span className="text-sm text-slate-400">Producer Supply</span>
              <span className="text-sm font-mono text-blue-400">{formatQuantity(summary.supply.food?.producerSupply, summary.supply.food?.unit)}</span>
            </div>

            <div className="flex justify-between items-center border-b border-slate-800 pb-2">
              <span className="text-sm text-slate-400">Total Supply</span>
              <span className="text-sm font-mono text-indigo-400">{formatQuantity(summary.supply.food?.totalAvailable, summary.supply.food?.unit)}</span>
            </div>

            <div className="flex justify-between items-center border-b border-slate-800 pb-2">
              <span className="text-sm text-slate-400">Max Production Cap.</span>
              <span className="text-sm font-mono text-purple-400">{formatQuantity(summary.supply.food?.productionCapacity, summary.supply.food?.unit)}</span>
            </div>
          </div>
        )}

        {/* Supply Chain */}
        {summary.supplyChain && (
          <div className="space-y-3 mt-2">
            <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">SUPPLY CHAIN</h4>
            <div className="flex justify-between items-center border-b border-slate-800 pb-2">
              <span className="text-sm text-slate-400">Pending Orders</span>
              <span className="text-sm font-mono text-slate-100">{summary.supplyChain.pendingOrders ?? '0'}</span>
            </div>
            <div className="flex justify-between items-center border-b border-slate-800 pb-2">
              <span className="text-sm text-slate-400">Active Shipments</span>
              <span className="text-sm font-mono text-slate-100">{summary.supplyChain.activeShipments ?? '0'}</span>
            </div>
          </div>
        )}
        
        {/* Activity */}
        {summary.activity && (
          <div className="space-y-3 mt-2">
            <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">ACTIVITY</h4>
            <div className="flex justify-between items-center border-b border-slate-800 pb-2">
              <span className="text-sm text-slate-400">Working</span>
              <span className="text-sm font-mono text-slate-100">{summary.activity.working ?? '0'}</span>
            </div>
            <div className="flex justify-between items-center border-b border-slate-800 pb-2">
              <span className="text-sm text-slate-400">Travelling</span>
              <span className="text-sm font-mono text-slate-100">{summary.activity.travelling ?? '0'}</span>
            </div>
            <div className="flex justify-between items-center border-b border-slate-800 pb-2">
              <span className="text-sm text-slate-400">Idle</span>
              <span className="text-sm font-mono text-slate-100">{summary.activity.idle ?? '0'}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
