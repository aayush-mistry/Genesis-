import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { worldApi } from '../../api/world';
import { systemApi } from '../../api/system';
import { timeApi } from '../../api/time';
import { eventApi } from '../../api/event';
import { environmentApi } from '../../api/environment';
import { resourcesApi } from '../../api/resources';
import { spatialApi } from '../../api/spatial';
import { Globe, Map, ChevronRight, ChevronDown, Clock, Activity, Cloud, Leaf } from 'lucide-react';

export function WorldInspector() {
  const [selectedEntity, setSelectedEntity] = useState<{ id: string; type: string; name: string } | null>(null);
  
  // Data Fetching
  const { data: hierarchy, isLoading: loadingHierarchy, error: hierarchyError } = useQuery({
    queryKey: ['worldHierarchy'],
    queryFn: worldApi.getHierarchy,
    refetchInterval: 5000,
    retry: false
  });

  const { data: systemStatus } = useQuery({
    queryKey: ['systemStatus'],
    queryFn: systemApi.getStatus,
    refetchInterval: 2000,
  });

  const { data: verification } = useQuery({
    queryKey: ['systemVerification'],
    queryFn: systemApi.getVerification,
    refetchInterval: 10000,
  });

  const { data: time } = useQuery({
    queryKey: ['time'],
    queryFn: timeApi.getTime,
    refetchInterval: 1000,
  });

  const { data: environment } = useQuery({
    queryKey: ['environment'],
    queryFn: environmentApi.getEnvironment,
    refetchInterval: 5000,
  });

  const { data: recentEvents } = useQuery({
    queryKey: ['recentEvents'],
    queryFn: async () => {
      const res = await eventApi.getHistory();
      return res.history.filter((e: { sourceModule: string, targetModule: string }) => 
        e.sourceModule === 'WorldEngine' || 
        e.targetModule === 'WorldEngine' ||
        e.sourceModule === 'EnvironmentEngine' ||
        e.targetModule === 'EnvironmentEngine'
      ).slice(0, 10);
    },
    refetchInterval: 2000,
  });

  // Selected Entity Fetching
  const { data: selectedEnv } = useQuery({
    queryKey: ['selectedEnv', selectedEntity?.id],
    queryFn: () => environmentApi.getEnvironmentRegions().then((res: any) => res.regions[selectedEntity!.id]),
    enabled: selectedEntity?.type === 'Region',
    refetchInterval: 5000,
  });

  const { data: selectedRes } = useQuery({
    queryKey: ['selectedRes', selectedEntity?.id],
    queryFn: () => resourcesApi.getResourcesByRegion(selectedEntity!.id),
    enabled: selectedEntity?.type === 'Region',
    refetchInterval: 5000,
  });

  const { data: selectedSpatial } = useQuery({
    queryKey: ['selectedSpatial', selectedEntity?.id],
    queryFn: async () => {
      // Find nearest to center (assume region center is its coords)
      if (selectedEntity?.type === 'Region') {
        const r = hierarchy?.regions.find((reg: any) => reg.id === selectedEntity.id);
        if (r) {
          const nearest = await spatialApi.getNearest(r.coordinates.x, r.coordinates.y);
          return nearest;
        }
      }
      return null;
    },
    enabled: selectedEntity?.type === 'Region',
    refetchInterval: 5000,
  });

  if (hierarchyError) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center bg-[#0a0a0a]">
        <Globe size={48} className="text-red-500/20 mb-4" />
        <h2 className="text-2xl font-semibold text-white mb-2">World Unavailable</h2>
        <p className="text-[#888]">The requested world does not exist or has not been initialized.</p>
        <p className="text-sm text-red-400 mt-4">Error: {(hierarchyError as Error).message}</p>
      </div>
    );
  }

  if (loadingHierarchy) {
    return <div className="p-8 text-[#888]">Loading World Inspector...</div>;
  }

  if (!hierarchy) return null;

  return (
    <div className="h-full flex flex-col space-y-4 bg-[#0a0a0a] overflow-hidden p-2 text-sm">
      {/* HEADER: WORLD OVERVIEW */}
      <div className="bg-[#121212] border border-[#222] rounded-lg p-4 flex justify-between items-center shadow-lg">
        <div>
          <h1 className="text-xl font-bold text-white tracking-wide uppercase flex items-center gap-2">
            <Globe className="text-blue-500" size={20} />
            {hierarchy.world.name}
          </h1>
          <p className="text-[#888] text-xs uppercase tracking-widest mt-1">Seed: {hierarchy.world.randomSeed} | ID: {hierarchy.world.id.split('-')[0]}</p>
        </div>
        
        <div className="flex gap-8 text-right">
          <div>
            <p className="text-[10px] text-[#555] uppercase font-bold tracking-widest">Simulation Time</p>
            <p className="text-white font-mono flex items-center gap-2">
              <Clock size={14} className="text-[#888]" />
              Day {time?.time.day} — {String(time?.time.hour).padStart(2, '0')}:{String(time?.time.minute).padStart(2, '0')}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-[#555] uppercase font-bold tracking-widest">Season</p>
            <p className="text-emerald-400 font-mono">{environment?.season || 'Unknown'}</p>
          </div>
          <div>
            <p className="text-[10px] text-[#555] uppercase font-bold tracking-widest">Entities</p>
            <p className="text-purple-400 font-mono">
              {hierarchy.regions.length} Regions
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-3 gap-4 min-h-0">
        
        {/* LEFT COLUMN: WORLD TREE */}
        <div className="col-span-1 bg-[#121212] border border-[#222] rounded-lg p-4 flex flex-col min-h-0 shadow-lg">
          <h2 className="text-[#888] text-xs font-bold uppercase tracking-widest mb-4 flex items-center gap-2">
            <Map size={14} /> World Hierarchy
          </h2>
          <div className="flex-1 overflow-y-auto space-y-1 pr-2 custom-scrollbar">
            <TreeItem 
              label={hierarchy.world.name} 
              icon={<Globe size={14} className="text-blue-400" />} 
              defaultOpen
            >
              {hierarchy.regions.map((region: any) => (
                <TreeItem 
                  key={region.id} 
                  label={region.name} 
                  icon={<Map size={14} className="text-emerald-500" />}
                  onClick={() => setSelectedEntity({ id: region.id, type: 'Region', name: region.name })}
                  isSelected={selectedEntity?.id === region.id}
                >
                  {region.cities.map((city: any) => (
                    <TreeItem 
                      key={city.id} 
                      label={city.name} 
                      icon={<Activity size={14} className="text-purple-500" />}
                      onClick={() => setSelectedEntity({ id: city.id, type: 'City', name: city.name })}
                      isSelected={selectedEntity?.id === city.id}
                    />
                  ))}
                </TreeItem>
              ))}
            </TreeItem>
          </div>
        </div>

        {/* RIGHT COLUMN: SELECTED ENTITY */}
        <div className="col-span-2 bg-[#121212] border border-[#222] rounded-lg p-4 flex flex-col min-h-0 shadow-lg overflow-y-auto custom-scrollbar">
          {!selectedEntity ? (
            <div className="h-full flex items-center justify-center text-[#555] italic">
              Select an entity from the World Tree to inspect
            </div>
          ) : (
            <div className="space-y-6">
              <div className="border-b border-[#222] pb-4">
                <h2 className="text-lg font-semibold text-white tracking-wide">{selectedEntity.name}</h2>
                <p className="text-[#888] font-mono text-xs">{selectedEntity.type} | ID: {selectedEntity.id}</p>
              </div>

              {selectedEntity.type === 'Region' && (
                <div className="grid grid-cols-2 gap-6">
                  
                  {/* Environment Panel */}
                  <div className="bg-[#1a1a1a] border border-[#333] rounded-lg p-4">
                    <h3 className="text-emerald-400 text-xs font-bold uppercase tracking-widest mb-3 flex items-center gap-2">
                      <Cloud size={14} /> Environment
                    </h3>
                    <div className="space-y-2 font-mono text-sm">
                      <div className="flex justify-between"><span className="text-[#888]">Climate:</span> <span className="text-white">{hierarchy.regions.find((r:any)=>r.id===selectedEntity.id)?.climate}</span></div>
                      <div className="flex justify-between"><span className="text-[#888]">Weather:</span> <span className="text-white">{selectedEnv?.weather?.currentType || 'Unknown'}</span></div>
                      <div className="flex justify-between"><span className="text-[#888]">Temp:</span> <span className="text-white">{selectedEnv?.temperature?.toFixed(1) || '--'}°C</span></div>
                      <div className="flex justify-between"><span className="text-[#888]">Humidity:</span> <span className="text-white">{selectedEnv?.humidity?.toFixed(1) || '--'}%</span></div>
                    </div>
                  </div>

                  {/* Spatial Panel */}
                  <div className="bg-[#1a1a1a] border border-[#333] rounded-lg p-4">
                    <h3 className="text-purple-400 text-xs font-bold uppercase tracking-widest mb-3 flex items-center gap-2">
                      <Map size={14} /> Spatial Data
                    </h3>
                    {(() => {
                      const r = hierarchy.regions.find((r:any)=>r.id===selectedEntity.id);
                      return (
                        <div className="space-y-2 font-mono text-sm">
                          <div className="flex justify-between"><span className="text-[#888]">Coords:</span> <span className="text-white">X: {r?.coordinates.x}, Y: {r?.coordinates.y}</span></div>
                          <div className="flex justify-between"><span className="text-[#888]">Area:</span> <span className="text-white">{r?.area || 0} km²</span></div>
                          <div className="flex justify-between"><span className="text-[#888]">Nearest:</span> <span className="text-white text-[10px]">{selectedSpatial?.id || 'None'}</span></div>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Resource Panel */}
                  <div className="col-span-2 bg-[#1a1a1a] border border-[#333] rounded-lg p-4">
                    <h3 className="text-blue-400 text-xs font-bold uppercase tracking-widest mb-3 flex items-center gap-2">
                      <Leaf size={14} /> Resources
                    </h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse font-mono text-xs">
                        <thead>
                          <tr className="border-b border-[#333] text-[#888]">
                            <th className="py-2">Type</th>
                            <th className="py-2 text-right">Quantity</th>
                            <th className="py-2 text-right">Max</th>
                            <th className="py-2 text-right">Regen</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedRes?.length ? selectedRes.map((res: any) => (
                            <tr key={res.id} className="border-b border-[#222]">
                              <td className="py-2 text-white">{res.type}</td>
                              <td className="py-2 text-right text-green-400">{res.currentQuantity?.toLocaleString() ?? '--'}</td>
                              <td className="py-2 text-right text-[#888]">{res.maximumCapacity?.toLocaleString() ?? '--'}</td>
                              <td className="py-2 text-right text-blue-400">{res.regenerationRate != null ? `+${res.regenerationRate.toFixed(2)}` : '--'}</td>
                            </tr>
                          )) : (
                            <tr><td colSpan={4} className="py-4 text-center text-[#555]">No resources tracked</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* BOTTOM ROW: STATUS & EVENTS */}
      <div className="grid grid-cols-3 gap-4 min-h-[200px]">
        
        {/* Engine Status */}
        <div className="col-span-2 bg-[#121212] border border-[#222] rounded-lg p-4 flex flex-col shadow-lg">
          <h2 className="text-[#888] text-xs font-bold uppercase tracking-widest mb-4">Engine Status</h2>
          <div className="grid grid-cols-3 gap-3">
            {systemStatus && Object.entries(systemStatus.engines).map(([name, engine]: [string, any]) => (
              <div key={name} className="bg-[#1a1a1a] p-3 rounded border border-[#222]">
                <div className="flex items-center justify-between mb-1">
                  <span className="capitalize font-semibold text-white text-xs tracking-wide">{name}</span>
                  <div className={`w-2 h-2 rounded-full ${engine.status === 'Running' ? 'bg-green-500' : engine.status === 'Ready' ? 'bg-blue-500' : 'bg-red-500'}`} />
                </div>
                <div className="text-[#888] text-[10px] font-mono leading-tight">{engine.details}</div>
              </div>
            ))}
          </div>

          <div className="mt-auto pt-3 border-t border-[#222]">
            <div className="flex items-center justify-between font-mono text-[10px]">
              <span className="text-[#888]">DETERMINISTIC WORLD HASH</span>
              <span className="text-blue-400">{verification?.hash || 'Computing...'}</span>
            </div>
          </div>
        </div>

        {/* Recent Events */}
        <div className="col-span-1 bg-[#121212] border border-[#222] rounded-lg p-4 flex flex-col shadow-lg min-h-0">
          <h2 className="text-[#888] text-xs font-bold uppercase tracking-widest mb-4">Recent World Events</h2>
          <div className="flex-1 overflow-y-auto space-y-2 custom-scrollbar">
            {recentEvents?.map((evt: any) => (
              <div key={evt.id} className="text-xs font-mono">
                <span className="text-purple-400 mr-2">
                  {String(evt.createdTime.hour).padStart(2, '0')}:{String(evt.createdTime.minute).padStart(2, '0')}
                </span>
                <span className="text-white">{evt.name}</span>
              </div>
            ))}
            {!recentEvents?.length && <div className="text-[#555] text-xs italic">No recent events</div>}
          </div>
        </div>

      </div>

    </div>
  );
}

// Helper Component for Tree
function TreeItem({ label, icon, children, defaultOpen = false, onClick, isSelected }: any) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const hasChildren = React.Children.count(children) > 0;

  return (
    <div className="select-none">
      <div 
        className={`flex items-center gap-1.5 py-1 px-2 rounded cursor-pointer ${isSelected ? 'bg-blue-500/20 text-blue-400' : 'hover:bg-[#1a1a1a] text-gray-300'}`}
        onClick={(e) => {
          e.stopPropagation();
          if (hasChildren) setIsOpen(!isOpen);
          if (onClick) onClick();
        }}
      >
        <div className="w-4 h-4 flex items-center justify-center">
          {hasChildren ? (
            isOpen ? <ChevronDown size={14} className="text-[#888]" /> : <ChevronRight size={14} className="text-[#888]" />
          ) : <div className="w-1" />}
        </div>
        {icon}
        <span className="truncate">{label}</span>
      </div>
      {isOpen && hasChildren && (
        <div className="ml-4 border-l border-[#333] pl-2 mt-1 space-y-1">
          {children}
        </div>
      )}
    </div>
  );
}
