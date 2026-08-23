import { useState } from 'react';
import { Sidebar } from '../components/inspector/Sidebar';
import { Dashboard } from '../components/inspector/Dashboard';
import { WorldDashboard } from '../components/world/WorldDashboard';
import { WorldInspector } from '../components/inspector/WorldInspector';
import { EnvironmentDashboard } from '../components/environment/EnvironmentDashboard';
import { ResourceInspector } from '../components/resources/ResourceInspector';
import { SpatialDashboard } from '../components/spatial/SpatialDashboard';
import { QueueInspector } from '../components/inspector/QueueInspector';
import { HistoryInspector } from '../components/inspector/HistoryInspector';
import { LiveLogs } from '../components/inspector/LiveLogs';
import { PerformanceView } from '../components/inspector/PerformanceView';
import { EventInjectionPanel } from '../components/inspector/EventInjectionPanel';
import { PerceptionDashboard } from '../components/perception/PerceptionDashboard';
import { SupplyDashboard } from '../components/supply/SupplyDashboard';
import { useQuery } from '@tanstack/react-query';
import { worldApi } from '../api/world';
import { useEffect } from 'react';

export default function EngineInspector() {
  const [activeTab, setActiveTab] = useState('inspector');

  return (
    <div className="flex w-full h-full bg-[#0a0a0a] text-[#e5e5e5] font-sans">
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />
      
      <div className="flex-1 overflow-hidden relative">
        <div className="absolute inset-0 overflow-y-auto p-8">
          {activeTab === 'dashboard' && <Dashboard />}
          {activeTab === 'inspector' && <WorldInspector />}
          {activeTab === 'world' && <WorldDashboard />}
          {activeTab === 'environment' && <EnvironmentDashboard />}
          {activeTab === 'resources' && <ResourceInspector />}
          {activeTab === 'spatial' && <SpatialDashboard />}
          {activeTab === 'perception' && <PerceptionDashboard />}
          {activeTab === 'supply' && <SupplyChainView />}
          {activeTab === 'queue' && <QueueInspector />}
          {activeTab === 'history' && <HistoryInspector />}
          {activeTab === 'logs' && <LiveLogs />}
          {activeTab === 'performance' && <PerformanceView />}
          {activeTab === 'injection' && <EventInjectionPanel />}
        </div>
      </div>
    </div>
  );
}

function SupplyChainView() {
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);

  const { data: regions, isLoading, isError } = useQuery({
    queryKey: ['regions'],
    queryFn: worldApi.getRegions,
    refetchInterval: 10000,
  });

  useEffect(() => {
    if (regions && regions.length > 0 && !selectedRegionId) {
      setSelectedRegionId(regions[0].id);
    }
  }, [regions, selectedRegionId]);

  if (isLoading) {
    return <div className="p-8 text-[#888]">Loading regions...</div>;
  }

  if (isError) {
    return <div className="p-8 text-red-500">Unable to load regions.</div>;
  }

  if (!regions || regions.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center bg-[#0a0a0a]">
        <h2 className="text-2xl font-semibold text-white mb-2">No Regions Available</h2>
        <p className="text-[#888]">Create a world and region to view the supply chain.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full space-y-4">
      <div className="bg-[#121212] border border-[#222] rounded-lg p-4 flex items-center justify-between shadow-lg">
        <h2 className="text-white font-bold tracking-widest uppercase">Supply Chain</h2>
        <div className="flex items-center gap-4">
          <label className="text-[#888] text-xs font-bold uppercase tracking-widest">Region</label>
          <select 
            value={selectedRegionId || ''} 
            onChange={(e) => setSelectedRegionId(e.target.value)}
            className="bg-[#1a1a1a] border border-[#333] text-white text-sm rounded px-3 py-1.5 focus:outline-none focus:border-blue-500 transition-colors"
          >
            {regions.map((r: any) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </div>
      </div>
      
      {selectedRegionId && (
        <div className="flex-1 min-h-0 relative">
          <div className="absolute inset-0 overflow-y-auto">
            <SupplyDashboard regionId={selectedRegionId} />
          </div>
        </div>
      )}
    </div>
  );
}
