import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Play, Pause, Square, Activity } from 'lucide-react';

export function Dashboard() {
  const queryClient = useQueryClient();

  const { data: timeData } = useQuery({
    queryKey: ['time'],
    queryFn: async () => {
      const res = await fetch('/api/v1/time');
      if (!res.ok) throw new Error('Network error');
      return res.json();
    },
    refetchInterval: 1000,
  });

  const { data: statsData } = useQuery({
    queryKey: ['stats'],
    queryFn: async () => {
      const res = await fetch('/api/v1/events/stats');
      if (!res.ok) throw new Error('Network error');
      return res.json();
    },
    refetchInterval: 1000,
  });

  const controlMutation = useMutation({
    mutationFn: async (action: string) => {
      const res = await fetch(`/api/v1/time/${action}`, { method: 'POST' });
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['time'] })
  });

  const formatTime = (time: any) => {
    if (!time) return '0000-00-00 00:00:00';
    return `${time.year.toString().padStart(4, '0')}-${time.month.toString().padStart(2, '0')}-${time.day.toString().padStart(2, '0')} ${time.hour.toString().padStart(2, '0')}:${time.minute.toString().padStart(2, '0')}:${time.second.toString().padStart(2, '0')}`;
  };

  const statCards = [
    { label: 'Total Events Created', value: statsData?.stats?.totalEventsCreated || 0, color: 'text-blue-400' },
    { label: 'Queued Events', value: statsData?.stats?.queuedEvents || 0, color: 'text-indigo-400' },
    { label: 'Executed Events', value: statsData?.stats?.executedEvents || 0, color: 'text-green-400' },
    { label: 'Failed Events', value: statsData?.stats?.failedEvents || 0, color: 'text-red-400' },
    { label: 'Cancelled Events', value: statsData?.stats?.cancelledEvents || 0, color: 'text-yellow-400' },
    { label: 'Avg Execution (ms)', value: statsData?.stats?.averageExecutionTime?.toFixed(2) || '0.00', color: 'text-purple-400' },
  ];

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-3xl font-light text-white tracking-tight">Simulation <span className="font-semibold text-indigo-400">Dashboard</span></h2>
          <p className="text-[#888] mt-1">Real-time overview of the Genesis Engine.</p>
        </div>
        
        <div className="flex items-center gap-2 bg-[#1a1a1a] p-1.5 rounded-lg border border-[#333]">
          <button 
            onClick={() => controlMutation.mutate('start')}
            className={`p-2 rounded-md transition-colors ${timeData?.state === 'Running' ? 'bg-green-500/20 text-green-400' : 'hover:bg-[#2a2a2a] text-[#888]'}`}
          >
            <Play size={18} />
          </button>
          <button 
            onClick={() => controlMutation.mutate('pause')}
            className={`p-2 rounded-md transition-colors ${timeData?.state === 'Paused' ? 'bg-yellow-500/20 text-yellow-400' : 'hover:bg-[#2a2a2a] text-[#888]'}`}
          >
            <Pause size={18} />
          </button>
          <button 
            onClick={() => controlMutation.mutate('reset')}
            className="p-2 rounded-md transition-colors hover:bg-[#2a2a2a] text-[#888] hover:text-red-400"
          >
            <Square size={18} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#121212] to-[#0a0a0a] border border-[#222] p-8 shadow-2xl">
          <div className="absolute top-0 right-0 p-8 opacity-10">
            <Activity size={120} />
          </div>
          <p className="text-sm uppercase tracking-widest text-indigo-400 font-semibold mb-2">Engine Time</p>
          <div className="text-5xl font-mono text-white mb-6 tracking-tight">
            {formatTime(timeData?.time)}
          </div>
          
          <div className="flex items-center gap-8 border-t border-[#222] pt-6">
            <div>
              <p className="text-xs text-[#888] uppercase tracking-wider mb-1">State</p>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${timeData?.state === 'Running' ? 'bg-green-500 shadow-[0_0_8px_#22c55e]' : 'bg-yellow-500'}`} />
                <span className="font-medium">{timeData?.state || 'Unknown'}</span>
              </div>
            </div>
            <div>
              <p className="text-xs text-[#888] uppercase tracking-wider mb-1">Ticks / Sec</p>
              <p className="font-mono text-lg">{timeData?.ticksPerSecond || 0}</p>
            </div>
            <div>
              <p className="text-xs text-[#888] uppercase tracking-wider mb-1">Tick Duration</p>
              <p className="font-mono text-lg">{timeData?.lastTickDurationMs?.toFixed(2) || '0.00'} ms</p>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          {/* Quick injection or something similar can go here */}
          <div className="flex-1 rounded-2xl bg-[#121212] border border-[#222] p-6 flex flex-col justify-center">
            <h3 className="text-sm font-semibold text-white mb-4">Quick Stats</h3>
            <div className="space-y-4">
               <div>
                 <div className="flex justify-between text-xs mb-1">
                   <span className="text-[#888]">CPU Usage</span>
                   <span>{statsData?.performance?.cpuUsage || 0}%</span>
                 </div>
                 <div className="h-1.5 w-full bg-[#222] rounded-full overflow-hidden">
                   <div className="h-full bg-indigo-500 w-1/4" />
                 </div>
               </div>
               <div>
                 <div className="flex justify-between text-xs mb-1">
                   <span className="text-[#888]">Memory (Heap)</span>
                   <span>{statsData?.performance?.memoryUsageMB || 0} MB</span>
                 </div>
                 <div className="h-1.5 w-full bg-[#222] rounded-full overflow-hidden">
                   <div className="h-full bg-purple-500" style={{ width: `${Math.min(((statsData?.performance?.memoryUsageMB || 0) / 500) * 100, 100)}%`}} />
                 </div>
               </div>
            </div>
          </div>
        </div>
      </div>

      <h3 className="text-xl font-light text-white mt-12 mb-4">Engine Statistics</h3>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {statCards.map((stat, i) => (
          <div key={i} className="bg-[#121212] border border-[#222] p-4 rounded-xl hover:border-[#444] transition-colors">
            <p className="text-[10px] uppercase tracking-widest text-[#888] mb-2">{stat.label}</p>
            <p className={`text-2xl font-mono font-medium ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
