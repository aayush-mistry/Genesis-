import { useState } from 'react';
import { Sidebar } from '../components/inspector/Sidebar';
import { Dashboard } from '../components/inspector/Dashboard';
import { WorldDashboard } from '../components/world/WorldDashboard';
import { EnvironmentDashboard } from '../components/environment/EnvironmentDashboard';
import { QueueInspector } from '../components/inspector/QueueInspector';
import { HistoryInspector } from '../components/inspector/HistoryInspector';
import { LiveLogs } from '../components/inspector/LiveLogs';
import { PerformanceView } from '../components/inspector/PerformanceView';
import { EventInjectionPanel } from '../components/inspector/EventInjectionPanel';

export default function EngineInspector() {
  const [activeTab, setActiveTab] = useState('dashboard');

  return (
    <div className="flex w-full h-full bg-[#0a0a0a] text-[#e5e5e5] font-sans">
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />
      
      <div className="flex-1 overflow-hidden relative">
        <div className="absolute inset-0 overflow-y-auto p-8">
          {activeTab === 'dashboard' && <Dashboard />}
          {activeTab === 'world' && <WorldDashboard />}
          {activeTab === 'environment' && <EnvironmentDashboard />}
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
