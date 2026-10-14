import React, { useEffect, useState } from 'react';

export const SupplyDashboard: React.FC<{ regionId: string }> = ({ regionId }) => {
  const [producers, setProducers] = useState<any[]>([]);
  const [inventories, setInventories] = useState<any[]>([]);
  const [wholesales, setWholesales] = useState<any[]>([]);
  const [shipments, setShipments] = useState<any[]>([]);
  const [requirements, setRequirements] = useState<any[]>([]);
  const [forecasts, setForecasts] = useState<any[]>([]);
  const [agriData, setAgriData] = useState<{ season: string; dayPhase: string; cropReports: any[] } | null>(null);

  useEffect(() => {
    if (!regionId) return;

    const fetchSupplyData = async () => {
      try {
        const prodRes = await fetch(`/api/v1/regions/${regionId}/production`);
        const prodData = await prodRes.json();
        if (prodData.producers) setProducers(prodData.producers);
        if (prodData.wholesale) setWholesales(prodData.wholesale);
        if (prodData.shipments) setShipments(prodData.shipments);

        const invRes = await fetch(`/api/v1/regions/${regionId}/inventory`);
        const invData = await invRes.json();
        setInventories(invData);
        
        const reqRes = await fetch(`/api/v1/procurement/requirements`);
        const reqData = await reqRes.json();
        setRequirements(reqData);

        const forecastRes = await fetch(`/api/v1/procurement/forecasts?regionId=${regionId}`);
        if (forecastRes.ok) {
          const forecastData = await forecastRes.json();
          if (Array.isArray(forecastData)) setForecasts(forecastData);
        }

        const agriRes = await fetch(`/api/v1/production/agriculture/status?regionId=${regionId}`);
        if (agriRes.ok) {
          const agriJson = await agriRes.json();
          setAgriData(agriJson);
        }
      } catch (error) {
        console.error("Failed to fetch supply data", error);
      }
    };

    fetchSupplyData();
    const interval = setInterval(fetchSupplyData, 5000);
    return () => clearInterval(interval);
  }, [regionId]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
      {/* Producers Panel */}
      <div className="bg-[#1e1e1e] border border-[#2a2a2a] rounded-xl shadow-lg p-6 flex flex-col min-h-[300px]">
        <div className="mb-4 flex justify-between items-center border-b border-[#2a2a2a] pb-2">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">Producers</h3>
          <span className="text-blue-400 font-mono text-sm">{producers.length}</span>
        </div>
        <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
          {producers.length === 0 ? (
            <div className="h-full flex items-center justify-center text-center">
              <p className="text-sm text-gray-500 italic">No producers available in this region yet.</p>
            </div>
          ) : (
            producers.map(p => (
              <div key={p.id} className="mb-4 border-b border-[#2a2a2a] pb-2">
                <div className="flex justify-between items-center mb-1">
                  <span className="font-medium text-sm text-[#e5e5e5]">{p.id}</span>
                  <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider border border-indigo-500/30 text-indigo-400 bg-indigo-500/10">{p.type}</span>
                </div>
                <div className="text-xs text-gray-500 font-mono">
                  Cap: {p.capacity} | Vac: {p.vacancies}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Inventory Panel */}
      <div className="bg-[#1e1e1e] border border-[#2a2a2a] rounded-xl shadow-lg p-6 flex flex-col min-h-[300px]">
        <div className="mb-4 flex justify-between items-center border-b border-[#2a2a2a] pb-2">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">Inventory</h3>
          <span className="text-emerald-400 font-mono text-sm">{inventories.length}</span>
        </div>
        <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
          {inventories.length === 0 ? (
            <div className="h-full flex items-center justify-center text-center">
              <p className="text-sm text-gray-500 italic">No inventory available.</p>
            </div>
          ) : (
            inventories.map(invData => (
              <div key={invData.workplace} className="mb-4 border-b border-[#2a2a2a] pb-2">
                <div className="font-medium text-sm mb-1 text-[#e5e5e5]">{invData.workplace}</div>
                <div className="text-xs space-y-1 font-mono">
                  {Object.values(invData.inventory.items || {}).map((item: any) => (
                    <div key={item.productId} className="flex justify-between text-[#bbb]">
                      <span>{item.productId}</span>
                      <span className="text-emerald-400">{item.totalQuantity} {item.unit}</span>
                    </div>
                  ))}
                  {Object.keys(invData.inventory.items || {}).length === 0 && (
                    <span className="text-gray-500 italic">Empty</span>
                  )}
                </div>
                <div className="text-[10px] text-gray-500 mt-2 font-mono uppercase">
                  Storage Limit: {invData.inventory.storageCapacity}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Wholesale Centers Panel */}
      <div className="bg-[#1e1e1e] border border-[#2a2a2a] rounded-xl shadow-lg p-6 flex flex-col min-h-[300px]">
        <div className="mb-4 flex justify-between items-center border-b border-[#2a2a2a] pb-2">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">Wholesale Centers</h3>
          <span className="text-purple-400 font-mono text-sm">{wholesales.length}</span>
        </div>
        <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
          {wholesales.length === 0 ? (
            <div className="h-full flex items-center justify-center text-center">
              <p className="text-sm text-gray-500 italic">No wholesale centers available.</p>
            </div>
          ) : (
            wholesales.map(w => (
              <div key={w.id} className="mb-4 border-b border-[#2a2a2a] pb-2">
                <div className="flex justify-between items-center mb-1">
                  <span className="font-medium text-sm text-[#e5e5e5]">{w.id}</span>
                </div>
                <div className="text-xs text-gray-500 font-mono">
                  Cap: {w.capacity} | Vac: {w.vacancies}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Shipments Panel */}
      <div className="bg-[#1e1e1e] border border-[#2a2a2a] rounded-xl shadow-lg p-6 flex flex-col min-h-[300px]">
        <div className="mb-4 flex justify-between items-center border-b border-[#2a2a2a] pb-2">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">Shipments</h3>
          <span className="text-orange-400 font-mono text-sm">{shipments.length}</span>
        </div>
        <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
          {shipments.length === 0 ? (
            <div className="h-full flex items-center justify-center text-center">
              <p className="text-sm text-gray-500 italic">No active shipments.</p>
            </div>
          ) : (
            shipments.map((s: any) => (
              <div key={s.id} className="mb-4 border-b border-[#2a2a2a] pb-2">
                <div className="flex justify-between items-center mb-1">
                  <span className="font-medium text-sm text-[#e5e5e5]">Order: {s.orderId}</span>
                  <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider border border-orange-500/30 text-orange-400 bg-orange-500/10">IN TRANSIT</span>
                </div>
                <div className="text-[10px] text-gray-500 font-mono uppercase">
                  ETA: Day {s.estimatedArrivalDay} | From: {s.originLocationId} | To: {s.destinationLocationId}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Procurement Requirements Panel */}
      <div className="bg-[#1e1e1e] border border-[#2a2a2a] rounded-xl shadow-lg p-6 flex flex-col min-h-[300px]">
        <div className="mb-4 flex justify-between items-center border-b border-[#2a2a2a] pb-2">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">Procurement</h3>
          <span className="text-pink-400 font-mono text-sm">{requirements.length}</span>
        </div>
        <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
          {requirements.length === 0 ? (
            <div className="h-full flex items-center justify-center text-center">
              <p className="text-sm text-gray-500 italic">No pending requirements.</p>
            </div>
          ) : (
            requirements.map((r: any, idx: number) => (
              <div key={idx} className="mb-4 border-b border-[#2a2a2a] pb-2">
                <div className="flex justify-between items-center mb-1">
                  <span className="font-medium text-sm text-[#e5e5e5]">{r.buyerId}</span>
                  <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider border ${r.status === 'FAILED' ? 'border-red-500/30 text-red-400 bg-red-500/10' : 'border-pink-500/30 text-pink-400 bg-pink-500/10'}`}>
                    {r.status}
                  </span>
                </div>
                <div className="text-[10px] text-gray-500 font-mono">
                  {r.productId} | Req: {r.requestedQuantity} | Stock: {r.currentStock}/{r.targetStock}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Demand Forecast & Balance Panel */}
      <div className="bg-[#1e1e1e] border border-[#2a2a2a] rounded-xl shadow-lg p-6 flex flex-col min-h-[300px]">
        <div className="mb-4 flex justify-between items-center border-b border-[#2a2a2a] pb-2">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">Demand Forecast</h3>
          <span className="text-cyan-400 font-mono text-sm">{forecasts.length}</span>
        </div>
        <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
          {forecasts.length === 0 ? (
            <div className="h-full flex items-center justify-center text-center">
              <p className="text-sm text-gray-500 italic">No forecast data available.</p>
            </div>
          ) : (
            forecasts.map((f: any) => (
              <div key={f.commodityId} className="mb-4 border-b border-[#2a2a2a] pb-2">
                <div className="flex justify-between items-center mb-1">
                  <span className="font-medium text-sm text-[#e5e5e5] uppercase">{f.commodityId}</span>
                  {f.forecast.status === 'SUFFICIENT' ? (
                    <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider border ${
                      f.analysis.condition === 'SHORTAGE' 
                        ? 'border-red-500/30 text-red-400 bg-red-500/10' 
                        : 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10'
                    }`}>
                      {f.analysis.condition}
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider border border-amber-500/30 text-amber-400 bg-amber-500/10">
                      {f.forecast.status === 'NO_DATA' ? 'NO DATA' : 'INSUFFICIENT HISTORY'}
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-gray-400 font-mono space-y-0.5">
                  <div className="flex justify-between">
                    <span className="text-gray-500">History:</span>
                    <span className="text-slate-300">{f.historicalConsumption.total} {f.unit} ({f.historicalConsumption.eventsCount} evts)</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Forecast:</span>
                    <span className={f.forecast.forecastDemand !== null ? 'text-cyan-400 font-bold' : 'text-amber-400 italic'}>
                      {f.forecast.forecastDemand !== null ? `${f.forecast.forecastDemand} ${f.unit}/day` : 'Unavailable'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Supply:</span>
                    <span className="text-emerald-400">{f.supply.availableInventory} {f.unit} {f.supply.inboundSupply > 0 ? `(+${f.supply.inboundSupply} in transit)` : ''}</span>
                  </div>
                  {f.analysis.projectedNet !== null && (
                    <div className="flex justify-between border-t border-[#2a2a2a] pt-0.5 mt-0.5">
                      <span className="text-gray-500">Net:</span>
                      <span className={f.analysis.projectedNet < 0 ? 'text-red-400 font-bold' : 'text-emerald-400 font-bold'}>
                        {f.analysis.projectedNet > 0 ? `+${f.analysis.projectedNet}` : f.analysis.projectedNet} {f.unit}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Agricultural Yield & Season Panel */}
      <div className="bg-[#1e1e1e] border border-[#2a2a2a] rounded-xl shadow-lg p-6 flex flex-col min-h-[300px]">
        <div className="mb-4 flex justify-between items-center border-b border-[#2a2a2a] pb-2">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">Crop Yield & Season</h3>
          {agriData && (
            <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider border ${
              agriData.season === 'Winter' 
                ? 'border-blue-500/40 text-blue-300 bg-blue-500/10' 
                : 'border-emerald-500/40 text-emerald-300 bg-emerald-500/10'
            }`}>
              {agriData.season}
            </span>
          )}
        </div>
        <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
          {!agriData || !agriData.cropReports || agriData.cropReports.length === 0 ? (
            <div className="h-full flex items-center justify-center text-center">
              <p className="text-sm text-gray-500 italic">No crop production recorded in this region.</p>
            </div>
          ) : (
            agriData.cropReports.map((c: any) => {
              const statusColors: Record<string, string> = {
                OPTIMAL: 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10',
                FAVORABLE: 'border-green-500/30 text-green-400 bg-green-500/10',
                REDUCED_YIELD: 'border-amber-500/30 text-amber-400 bg-amber-500/10',
                DORMANT_UNSUITABLE: 'border-blue-500/30 text-blue-300 bg-blue-500/10',
                RESOURCE_CONSTRAINED: 'border-orange-500/30 text-orange-400 bg-orange-500/10',
                SEVERE_ADVERSE: 'border-red-500/30 text-red-400 bg-red-500/10',
              };
              const badgeClass = statusColors[c.status] || 'border-gray-500/30 text-gray-400 bg-gray-500/10';

              return (
                <div key={c.workplaceId || c.cropId} className="mb-4 border-b border-[#2a2a2a] pb-2">
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-medium text-sm text-[#e5e5e5] uppercase">{c.cropType}</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider border ${badgeClass}`}>
                      {c.status.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="text-[11px] text-gray-400 font-mono space-y-0.5">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Yield Multiplier:</span>
                      <span className={c.overallEnvironmentalMultiplier > 0 ? 'text-emerald-400 font-bold' : 'text-blue-300 font-bold'}>
                        {(c.overallEnvironmentalMultiplier * 100).toFixed(0)}%
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Output:</span>
                      <span className="text-slate-200">{c.finalYield} kg (Cap: {c.capacityYield})</span>
                    </div>
                    <div className="flex justify-between text-[10px] text-gray-500">
                      <span>S: {(c.seasonFactor * 100).toFixed(0)}%</span>
                      <span>T: {(c.temperatureFactor * 100).toFixed(0)}%</span>
                      <span>W: {(c.weatherFactor * 100).toFixed(0)}%</span>
                      <span>Soil: {(c.soilFactor * 100).toFixed(0)}%</span>
                    </div>
                    <div className="text-[10px] text-gray-400 italic mt-1 leading-tight">
                      {c.explanation}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};


