import React, { useEffect, useState } from 'react';

export const SupplyDashboard: React.FC<{ regionId: string }> = ({ regionId }) => {
  const [producers, setProducers] = useState<any[]>([]);
  const [inventories, setInventories] = useState<any[]>([]);

  useEffect(() => {
    if (!regionId) return;

    const fetchSupplyData = async () => {
      try {
        const prodRes = await fetch(`/api/v1/regions/${regionId}/production`);
        const prodData = await prodRes.json();
        if (prodData.producers) setProducers(prodData.producers);

        const invRes = await fetch(`/api/v1/regions/${regionId}/inventory`);
        const invData = await invRes.json();
        setInventories(invData);
      } catch (error) {
        console.error("Failed to fetch supply data", error);
      }
    };

    fetchSupplyData();
    const interval = setInterval(fetchSupplyData, 5000);
    return () => clearInterval(interval);
  }, [regionId]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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

      {/* Wholesale Centers Panel Placeholder */}
      <div className="bg-[#1e1e1e] border border-[#2a2a2a] rounded-xl shadow-lg p-6 flex flex-col min-h-[300px]">
        <div className="mb-4 flex justify-between items-center border-b border-[#2a2a2a] pb-2">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">Wholesale Centers</h3>
          <span className="text-purple-400 font-mono text-sm">0</span>
        </div>
        <div className="flex-1 flex items-center justify-center text-center">
          <p className="text-sm text-gray-500 italic">No wholesale centers available.</p>
        </div>
      </div>

      {/* Shipments Panel Placeholder */}
      <div className="bg-[#1e1e1e] border border-[#2a2a2a] rounded-xl shadow-lg p-6 flex flex-col min-h-[300px]">
        <div className="mb-4 flex justify-between items-center border-b border-[#2a2a2a] pb-2">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">Shipments</h3>
          <span className="text-orange-400 font-mono text-sm">0</span>
        </div>
        <div className="flex-1 flex items-center justify-center text-center">
          <p className="text-sm text-gray-500 italic">No active shipments.</p>
        </div>
      </div>
    </div>
  );
};
