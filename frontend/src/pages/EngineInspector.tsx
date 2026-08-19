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
