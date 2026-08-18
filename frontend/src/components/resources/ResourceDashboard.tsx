import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { worldApi } from '../../api/world';
import { resourcesApi } from '../../api/resources';
import { Leaf, Mountain } from 'lucide-react';
import { Region, Resource } from '@genesis/shared';

export function ResourceDashboard() {
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);

  const { data: regions } = useQuery({
    queryKey: ['regions'],
    queryFn: worldApi.getRegions,
  });

  const { data: resources, isLoading: loadingResources } = useQuery({
    queryKey: ['resources', selectedRegion],
    queryFn: () => selectedRegion ? resourcesApi.getResourcesByRegion(selectedRegion) : Promise.resolve([]),
    enabled: !!selectedRegion,
    refetchInterval: 5000,
  });

  useEffect(() => {
    if (regions && regions.length > 0 && !selectedRegion) {
      setSelectedRegion(regions[0].id);
    }
  }, [regions, selectedRegion]);

  return (
    <div className="flex flex-col h-full space-y-6">
      <div className="flex gap-4 overflow-x-auto pb-4 hide-scrollbar">
        {regions?.map((region: Region) => (
          <button
            key={region.id}
            onClick={() => setSelectedRegion(region.id)}
            className={`flex-shrink-0 px-6 py-3 rounded-xl border transition-all ${
              selectedRegion === region.id 
                ? 'bg-green-500/10 border-green-500/50 text-green-400' 
                : 'bg-[#121212] border-[#222] text-[#888] hover:border-[#444] hover:text-white'
            }`}
          >
            <div className="font-medium">{region.name}</div>
            <div className="text-xs opacity-60 mt-1">{region.climate}</div>
          </button>
        ))}
      </div>

      <div className="flex-1 bg-[#121212] rounded-2xl border border-[#222] p-8 overflow-y-auto">
        {loadingResources && <div className="text-[#888] animate-pulse">Scanning terrain for resources...</div>}
        
        {!loadingResources && resources && resources.length === 0 && (
          <div className="text-[#555] text-center mt-20">
            <Mountain size={48} className="mx-auto mb-4 opacity-20" />
            <p>No resources detected in this region.</p>
          </div>
        )}

        {!loadingResources && resources && resources.length > 0 && (
          <div>
            <h3 className="text-lg font-light text-white mb-6 flex items-center gap-2">
              <Leaf className="text-green-400" size={20} />
              Natural Resources in Region
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {resources.map((resource: Resource) => (
                <div key={resource.id} className="bg-[#0a0a0a] border border-[#222] rounded-xl p-5 hover:border-[#333] transition-colors flex flex-col justify-between">
                  <div>
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h4 className="text-sm font-semibold text-white">{resource.name}</h4>
                        <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full mt-2 inline-block ${
                          resource.renewable 
                            ? 'bg-green-500/10 text-green-400 border border-green-500/20' 
                            : 'bg-[#222] text-[#888] border border-[#333]'
                        }`}>
                          {resource.renewable ? 'RENEWABLE' : 'NON-RENEWABLE'}
                        </span>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-mono text-indigo-300">
                          {Math.floor(resource.currentAmount).toLocaleString()} <span className="text-xs text-indigo-300/60">{resource.unit}</span>
                        </div>
                        <div className="text-[10px] text-[#666]" title="Capacity: The estimated maximum amount this region can naturally support.">
                          Capacity: {Math.floor(resource.maximumAmount).toLocaleString()} {resource.unit}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4 mt-6">
                      {resource.condition && (
                        <div title="The current environmental or biological condition of this resource.">
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-[#888]">{resource.condition.type}</span>
                            <span className="text-[#ccc]">{(resource.condition.value * 100).toFixed(1)}%</span>
                          </div>
                          <div className="h-1 w-full bg-[#222] rounded-full overflow-hidden">
                            <div className="h-full bg-blue-500" style={{ width: `${resource.condition.value * 100}%` }} />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-[#222] space-y-2">
                    {resource.renewable ? (
                      <div className="flex justify-between text-xs" title="How quickly this resource naturally replenishes under the current environmental conditions.">
                        <span className="text-[#666]">Natural Recovery</span>
                        <span className="text-green-400/80 font-mono">
                          +{resource.naturalRecoveryRate !== null ? resource.naturalRecoveryRate.toFixed(1) : 0} {resource.unit}/hr
                        </span>
                      </div>
                    ) : (
                      <div className="flex justify-between text-xs" title="Non-renewable resources do not naturally replenish during the simulation.">
                        <span className="text-[#666]">Natural Recovery</span>
                        <span className="text-[#555] font-mono">None</span>
                      </div>
                    )}
                    
                    <div className="flex justify-between text-xs">
                      <span className="text-[#666]">Consumption</span>
                      <span className="text-[#888] font-mono">
                        {resource.consumptionRate !== null ? `-${resource.consumptionRate.toFixed(1)} ${resource.unit}/hr` : 'Not yet simulated'}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
