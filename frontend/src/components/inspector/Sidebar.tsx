import { LayoutDashboard, ListOrdered, History, ScrollText, ActivitySquare, PlusSquare, Globe, Cloud, Leaf, Map, Eye, Briefcase, Landmark } from 'lucide-react';

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export function Sidebar({ activeTab, onTabChange }: SidebarProps) {
  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'inspector', label: 'World Inspector', icon: Eye },
    { id: 'world', label: 'World Engine', icon: Globe },
    { id: 'environment', label: 'Environment Engine', icon: Cloud },
    { id: 'resources', label: 'Resource Engine', icon: Leaf },
    { id: 'spatial', label: 'Spatial Engine', icon: Map },
    { id: 'perception', label: 'Perception System', icon: Eye },
    { id: 'supply', label: 'Supply Chain', icon: Briefcase },
    { id: 'banking', label: 'Banking Engine', icon: Landmark },
    { id: 'queue', label: 'Queue', icon: ListOrdered },
    { id: 'history', label: 'History', icon: History },
    { id: 'logs', label: 'Live Logs', icon: ScrollText },
    { id: 'performance', label: 'Performance', icon: ActivitySquare },
    { id: 'injection', label: 'Event Injection', icon: PlusSquare },
  ];

  return (
    <div className="w-64 h-full bg-[#121212] border-r border-[#2a2a2a] flex flex-col z-10 shadow-[4px_0_24px_rgba(0,0,0,0.5)]">
      <div className="p-6 border-b border-[#2a2a2a]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <span className="text-white font-bold text-xl">G</span>
          </div>
          <div>
            <h1 className="font-semibold text-white tracking-wide">Project Genesis</h1>
            <p className="text-xs text-[#888] tracking-widest uppercase mt-0.5">Engine Inspector</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar py-6 px-3 space-y-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 ${
                isActive 
                  ? 'bg-indigo-500/10 text-indigo-400 font-medium border border-indigo-500/20' 
                  : 'text-[#888] hover:bg-[#1a1a1a] hover:text-[#bbb] border border-transparent'
              }`}
            >
              <Icon size={18} className={isActive ? 'text-indigo-400' : ''} />
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="p-4 border-t border-[#2a2a2a] text-center">
        <p className="text-[10px] text-[#555] uppercase tracking-widest">v1.0.0 Architecture</p>
      </div>
    </div>
  );
}
