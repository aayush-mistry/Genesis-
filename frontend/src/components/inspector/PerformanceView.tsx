import { useQuery } from '@tanstack/react-query';
import { Activity, Cpu, Database, Network } from 'lucide-react';

export function PerformanceView() {
  const { data: statsData } = useQuery({
    queryKey: ['stats'],
    queryFn: async () => {
      const res = await fetch('/api/v1/events/stats');
      if (!res.ok) throw new Error('Network error');
      return res.json();
    },
    refetchInterval: 1000,
  });

  const perf = statsData?.performance || {};
  const stats = statsData?.stats || {};

  const cards = [
    { title: 'Memory Usage', value: `${perf.memoryUsageMB || 0} MB`, icon: Database, color: 'text-blue-400' },
    { title: 'Tick Processing Time', value: `${perf.tickProcessingTime?.toFixed(2) || 0} ms`, icon: Activity, color: 'text-purple-400' },
    { title: 'Queue Operations', value: perf.priorityQueueOperations || 0, icon: Network, color: 'text-indigo-400' },
    { title: 'CPU Usage', value: `${perf.cpuUsage || 0}%`, icon: Cpu, color: 'text-green-400' },
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div>
        <h2 className="text-3xl font-light text-white tracking-tight">Performance <span className="font-semibold text-indigo-400">Monitor</span></h2>
        <p className="text-[#888] mt-1">Detailed profiling of the Event Scheduler and Time Engine.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {cards.map((card, i) => {
          const Icon = card.icon;
          return (
            <div key={i} className="bg-[#121212] border border-[#222] p-6 rounded-2xl shadow-xl flex flex-col justify-between h-36 relative overflow-hidden group hover:border-[#333] transition-colors">
              <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity">
                <Icon size={80} />
              </div>
              <div className="flex items-center gap-3 relative z-10">
                <Icon size={20} className="text-[#555]" />
                <h3 className="text-sm font-medium text-[#888]">{card.title}</h3>
              </div>
              <p className={`text-4xl font-light tracking-tight relative z-10 ${card.color}`}>{card.value}</p>
            </div>
          )
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-[#121212] border border-[#222] p-8 rounded-2xl shadow-xl">
          <h3 className="text-lg font-semibold text-white mb-6">Execution Analytics</h3>
          <div className="space-y-6">
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-[#888]">Average Execution Time</span>
                <span className="font-mono text-white">{stats.averageExecutionTime?.toFixed(2) || '0.00'} ms</span>
              </div>
              <div className="h-2 w-full bg-[#222] rounded-full overflow-hidden">
                <div className="h-full bg-purple-500 w-1/3" />
              </div>
            </div>
            
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-[#888]">Longest Execution Time</span>
                <span className="font-mono text-white">{stats.longestExecutionTime?.toFixed(2) || '0.00'} ms</span>
              </div>
              <div className="h-2 w-full bg-[#222] rounded-full overflow-hidden">
                <div className="h-full bg-red-500 w-2/3" />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-[#888]">Total Scheduling Time (Cumulative)</span>
                <span className="font-mono text-white">{perf.schedulingTime?.toFixed(2) || '0.00'} ms</span>
              </div>
              <div className="h-2 w-full bg-[#222] rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 w-1/2" />
              </div>
            </div>
          </div>
        </div>

        <div className="bg-[#121212] border border-[#222] p-8 rounded-2xl shadow-xl">
          <h3 className="text-lg font-semibold text-white mb-6">Queue Health</h3>
          <div className="space-y-6">
            <div className="flex justify-between items-center py-3 border-b border-[#222]">
              <span className="text-[#888]">Peak Queue Size</span>
              <span className="text-2xl font-mono text-indigo-400">{stats.peakQueueSize || 0}</span>
            </div>
            <div className="flex justify-between items-center py-3 border-b border-[#222]">
              <span className="text-[#888]">Average Queue Length</span>
              <span className="text-2xl font-mono text-blue-400">{perf.averageQueueLength || 0}</span>
            </div>
            <div className="flex justify-between items-center py-3 border-b border-[#222]">
              <span className="text-[#888]">Failed Events</span>
              <span className="text-2xl font-mono text-red-400">{stats.failedEvents || 0}</span>
            </div>
            <div className="flex justify-between items-center py-3">
              <span className="text-[#888]">Recurring Events</span>
              <span className="text-2xl font-mono text-green-400">{stats.recurringEvents || 0}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
