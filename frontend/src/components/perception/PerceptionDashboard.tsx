import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw, Search, Eye, Map, Cloud, Clock, User, Box } from 'lucide-react';

const API_BASE_URL = '/api/v1';

export function PerceptionDashboard() {
  const [citizenId, setCitizenId] = useState('');
  const [activeCitizenId, setActiveCitizenId] = useState('');

  const { data: citizens } = useQuery({
    queryKey: ['citizens'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE_URL}/citizens`);
      if (!res.ok) throw new Error('Failed to fetch citizens');
      return res.json();
    }
  });

  const { data: snapshot, isLoading: isLoadingSnapshot, error: snapshotError } = useQuery({
    queryKey: ['perception', activeCitizenId, 'snapshot'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE_URL}/perception/${activeCitizenId}/snapshot`);
      if (!res.ok) throw new Error('Failed to fetch snapshot');
      return res.json();
    },
    enabled: !!activeCitizenId,
    refetchInterval: 2000
  });

  const { data: context, isLoading: isLoadingContext, error: contextError } = useQuery({
    queryKey: ['perception', activeCitizenId, 'context'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE_URL}/perception/${activeCitizenId}/context`);
      if (!res.ok) throw new Error('Failed to fetch context');
      return res.json();
    },
    enabled: !!activeCitizenId,
    refetchInterval: 2000
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setActiveCitizenId(citizenId);
  };

  const selectCitizen = (id: string) => {
    setCitizenId(id);
    setActiveCitizenId(id);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white mb-1">Perception System</h2>
          <p className="text-[#888] text-sm">Phase 4.2 - View exactly what a citizen perceives</p>
        </div>
      </div>

      <div className="flex gap-6">
        {/* Left column: Search and list */}
        <div className="w-1/3 space-y-4">
          <div className="bg-[#121212] rounded-xl border border-[#2a2a2a] p-4 shadow-xl">
            <h3 className="text-sm font-semibold text-white uppercase tracking-wider mb-4 flex items-center gap-2">
              <Search size={16} className="text-indigo-400" />
              Target Citizen
            </h3>
            
            <form onSubmit={handleSearch} className="flex gap-2 mb-4">
              <input 
                type="text" 
                placeholder="citizen-123456" 
                className="flex-1 bg-[#1a1a1a] border border-[#333] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
                value={citizenId}
                onChange={(e) => setCitizenId(e.target.value)}
              />
              <button type="submit" className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                Inspect
              </button>
            </form>

            <div className="text-xs text-[#666] mb-2 font-medium">AVAILABLE CITIZENS</div>
            <div className="space-y-1 max-h-64 overflow-y-auto pr-2 custom-scrollbar">
              {citizens?.slice(0, 20).map((c: any) => (
                <button
                  key={c.id}
                  onClick={() => selectCitizen(c.id)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                    activeCitizenId === c.id 
                      ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30' 
                      : 'text-[#aaa] hover:bg-[#1a1a1a] border border-transparent'
                  }`}
                >
                  <div className="font-medium">{c.id}</div>
                  <div className="text-xs opacity-60 flex justify-between">
                    <span>{c.name}</span>
                    <span>{c.gender}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right column: Perception Data */}
        <div className="flex-1 space-y-4">
          {!activeCitizenId ? (
            <div className="h-64 flex flex-col items-center justify-center bg-[#121212] rounded-xl border border-[#2a2a2a] text-[#666]">
              <Eye size={48} className="mb-4 opacity-20" />
              <p>Select a citizen to view their perception</p>
            </div>
          ) : isLoadingSnapshot ? (
            <div className="h-64 flex items-center justify-center bg-[#121212] rounded-xl border border-[#2a2a2a]">
              <RefreshCw className="animate-spin text-indigo-500" size={24} />
            </div>
          ) : snapshotError ? (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 text-red-400">
              <h3 className="font-bold mb-2">Error Loading Perception</h3>
              <p className="text-sm">{(snapshotError as Error).message}</p>
            </div>
          ) : snapshot && (
            <>
              {/* Snapshot Headers */}
              <div className="flex gap-4 mb-2">
                <div className="bg-[#121212] border border-[#2a2a2a] rounded-lg px-4 py-2 flex items-center gap-3">
                  <Clock size={16} className="text-[#888]" />
                  <span className="text-sm text-[#aaa]">Snapshot Time:</span>
                  <span className="text-sm font-mono text-white">{new Date(snapshot.timestamp).toISOString()}</span>
                </div>
              </div>

              {/* Grid of Perception Areas */}
              <div className="grid grid-cols-2 gap-4">
                
                {/* Self Perception */}
                <div className="bg-[#121212] rounded-xl border border-[#2a2a2a] p-4 shadow-xl">
                  <h3 className="text-sm font-semibold text-white uppercase tracking-wider mb-4 flex items-center gap-2">
                    <User size={16} className="text-blue-400" />
                    Self State
                  </h3>
                  <div className="grid grid-cols-2 gap-y-3 gap-x-4 text-sm">
                    <div><span className="text-[#666] block text-xs">Citizen ID</span><span className="text-[#eee]">{snapshot.self.citizenId}</span></div>
                    <div><span className="text-[#666] block text-xs">Age</span><span className="text-[#eee]">{snapshot.self.age}</span></div>
                    
                    <div className="col-span-2 mt-2 pt-2 border-t border-[#2a2a2a]">
                      <span className="text-[#666] block text-xs mb-2">Vitals</span>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="bg-[#1a1a1a] rounded px-2 py-1 flex justify-between">
                          <span className="text-[#888]">Hunger</span>
                          <span className={snapshot.self.vitalState.hunger > 80 ? 'text-red-400' : 'text-green-400'}>
                            {Math.round(snapshot.self.vitalState.hunger)}%
                          </span>
                        </div>
                        <div className="bg-[#1a1a1a] rounded px-2 py-1 flex justify-between">
                          <span className="text-[#888]">Thirst</span>
                          <span className={snapshot.self.vitalState.thirst > 80 ? 'text-red-400' : 'text-green-400'}>
                            {Math.round(snapshot.self.vitalState.thirst)}%
                          </span>
                        </div>
                        <div className="bg-[#1a1a1a] rounded px-2 py-1 flex justify-between">
                          <span className="text-[#888]">Energy</span>
                          <span className={snapshot.self.vitalState.energy < 20 ? 'text-red-400' : 'text-green-400'}>
                            {Math.round(snapshot.self.vitalState.energy)}%
                          </span>
                        </div>
                        <div className="bg-[#1a1a1a] rounded px-2 py-1 flex justify-between">
                          <span className="text-[#888]">Health</span>
                          <span className={snapshot.self.vitalState.health < 50 ? 'text-red-400' : 'text-green-400'}>
                            {Math.round(snapshot.self.vitalState.health)}%
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Location Perception */}
                <div className="bg-[#121212] rounded-xl border border-[#2a2a2a] p-4 shadow-xl">
                  <h3 className="text-sm font-semibold text-white uppercase tracking-wider mb-4 flex items-center gap-2">
                    <Map size={16} className="text-emerald-400" />
                    Location Knowledge
                  </h3>
                  <div className="space-y-3 text-sm">
                    <div>
                      <span className="text-[#666] block text-xs mb-1">Hierarchy</span>
                      <div className="bg-[#1a1a1a] p-2 rounded border border-[#2a2a2a] text-xs font-mono space-y-1">
                        <div className="flex justify-between"><span className="text-[#888]">World</span><span className="text-white truncate max-w-[150px]">{snapshot.location.worldId}</span></div>
                        <div className="flex justify-between"><span className="text-[#888]">Region</span><span className="text-white truncate max-w-[150px]">{snapshot.location.regionId}</span></div>
                        <div className="flex justify-between"><span className="text-[#888]">City</span><span className="text-white truncate max-w-[150px]">{snapshot.location.cityId || 'None'}</span></div>
                        <div className="flex justify-between"><span className="text-[#888]">District</span><span className="text-white truncate max-w-[150px]">{snapshot.location.districtId || 'None'}</span></div>
                        <div className="flex justify-between"><span className="text-[#888]">Building</span><span className="text-white truncate max-w-[150px]">{snapshot.location.buildingId || 'None'}</span></div>
                      </div>
                    </div>
                    <div>
                      <span className="text-[#666] block text-xs">Coordinates</span>
                      <span className="text-[#eee] font-mono text-xs">
                        X: {Math.round(snapshot.location.coordinates.x)}, Y: {Math.round(snapshot.location.coordinates.y)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Environment Perception */}
                <div className="bg-[#121212] rounded-xl border border-[#2a2a2a] p-4 shadow-xl">
                  <h3 className="text-sm font-semibold text-white uppercase tracking-wider mb-4 flex items-center gap-2">
                    <Cloud size={16} className="text-sky-400" />
                    Environment
                  </h3>
                  <div className="grid grid-cols-2 gap-y-3 gap-x-4 text-sm">
                    <div><span className="text-[#666] block text-xs">Weather</span><span className="text-[#eee]">{snapshot.environment.weather}</span></div>
                    <div><span className="text-[#666] block text-xs">Season</span><span className="text-[#eee]">{snapshot.environment.season}</span></div>
                    <div><span className="text-[#666] block text-xs">Temp</span><span className="text-[#eee]">{snapshot.environment.temperature}°C</span></div>
                    <div><span className="text-[#666] block text-xs">Humidity</span><span className="text-[#eee]">{snapshot.environment.humidity}%</span></div>
                    <div><span className="text-[#666] block text-xs">Day Phase</span><span className="text-[#eee]">{snapshot.environment.dayPhase}</span></div>
                  </div>
                </div>

                {/* Nearby Info */}
                <div className="bg-[#121212] rounded-xl border border-[#2a2a2a] p-4 shadow-xl">
                  <h3 className="text-sm font-semibold text-white uppercase tracking-wider mb-4 flex items-center gap-2">
                    <Box size={16} className="text-amber-400" />
                    Nearby Entities
                  </h3>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="bg-[#1a1a1a] rounded p-2 text-center border border-[#2a2a2a]">
                      <div className="text-xl font-bold text-emerald-400 mb-1">{snapshot.nearbyResources?.length || 0}</div>
                      <div className="text-[10px] text-[#888] uppercase tracking-wider">Resources</div>
                    </div>
                    <div className="bg-[#1a1a1a] rounded p-2 text-center border border-[#2a2a2a]">
                      <div className="text-xl font-bold text-blue-400 mb-1">{snapshot.nearbyBuildings?.length || 0}</div>
                      <div className="text-[10px] text-[#888] uppercase tracking-wider">Buildings</div>
                    </div>
                    <div className="bg-[#1a1a1a] rounded p-2 text-center border border-[#2a2a2a]">
                      <div className="text-xl font-bold text-purple-400 mb-1">{snapshot.nearbyEntities?.length || 0}</div>
                      <div className="text-[10px] text-[#888] uppercase tracking-wider">Citizens</div>
                    </div>
                  </div>
                </div>

              </div>
              
              {/* Context Dump */}
              <div className="bg-[#121212] rounded-xl border border-[#2a2a2a] p-4 shadow-xl mt-4">
                 <h3 className="text-sm font-semibold text-white uppercase tracking-wider mb-4 flex items-center gap-2">
                    <Eye size={16} className="text-pink-400" />
                    Decision Context (Phase 4.1 Input)
                  </h3>
                  {isLoadingContext ? (
                     <div className="flex justify-center p-4"><RefreshCw className="animate-spin text-[#666]" size={16} /></div>
                  ) : contextError ? (
                    <div className="text-red-400 text-sm">Failed to load DecisionContext</div>
                  ) : context && (
                    <pre className="bg-[#0a0a0a] border border-[#222] p-4 rounded-lg text-xs font-mono text-[#aaa] overflow-x-auto">
                      {JSON.stringify(context, null, 2)}
                    </pre>
                  )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
