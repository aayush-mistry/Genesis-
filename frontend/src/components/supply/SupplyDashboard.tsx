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
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="bg-[#1e1e1e] border border-[#2a2a2a] rounded-xl shadow-lg p-6">
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-white">Production Entities</h3>
        </div>
        <div className="h-64 overflow-y-auto pr-2">
          {producers.length === 0 ? <p className="text-sm text-gray-500">No producers found in this region.</p> : (
            producers.map(p => (
              <div key={p.id} className="mb-4 border-b border-[#2a2a2a] pb-2">
                <div className="flex justify-between items-center mb-1">
                  <span className="font-medium text-sm text-[#e5e5e5]">{p.id}</span>
                  <span className="px-2 py-0.5 rounded text-xs border border-indigo-500/30 text-indigo-400 bg-indigo-500/10">{p.type}</span>
                </div>
                <div className="text-xs text-gray-500">
                  Capacity: {p.capacity} | Vacancies: {p.vacancies}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="bg-[#1e1e1e] border border-[#2a2a2a] rounded-xl shadow-lg p-6">
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-white">Inventories</h3>
        </div>
        <div className="h-64 overflow-y-auto pr-2">
          {inventories.length === 0 ? <p className="text-sm text-gray-500">No inventories found in this region.</p> : (
            inventories.map(invData => (
              <div key={invData.workplace} className="mb-4 border-b border-[#2a2a2a] pb-2">
                <div className="font-medium text-sm mb-1 text-[#e5e5e5]">{invData.workplace}</div>
                <div className="text-xs space-y-1">
                  {Object.values(invData.inventory.items || {}).map((item: any) => (
                    <div key={item.productId} className="flex justify-between text-[#bbb]">
                      <span>{item.productId}</span>
                      <span>{item.totalQuantity} {item.unit}</span>
                    </div>
                  ))}
                  {Object.keys(invData.inventory.items || {}).length === 0 && (
                    <span className="text-gray-500">Empty</span>
                  )}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  Storage Limit: {invData.inventory.storageCapacity}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
