import { useQuery } from '@tanstack/react-query';
import { resourcesApi } from '../../api/resources';
import { Leaf, Mountain, Zap, Activity } from 'lucide-react';

export function ResourceStats() {
  const { data: stats, isLoading, isError } = useQuery({
    queryKey: ['resourceStats'],
    queryFn: resourcesApi.getStatistics,
    refetchInterval: 5000,
  });

  if (isLoading) return <div className="text-[#888] animate-pulse">Loading Resource Stats...</div>;
  if (isError || !stats) return <div className="text-red-400">Failed to load resource statistics.</div>;

  const statCards = [
    { label: 'Total Quantity', value: stats.totalQuantity.toLocaleString(), color: 'text-indigo-400', icon: <Mountain size={18} /> },
    { label: 'Avg Condition', value: `${(stats.averageCondition * 100).toFixed(1)}%`, color: 'text-blue-400', icon: <Activity size={18} /> },
    { label: 'Renewable', value: stats.renewableQuantity.toLocaleString(), color: 'text-green-400', icon: <Leaf size={18} /> },
    { label: 'Non-Renewable', value: stats.nonRenewableQuantity.toLocaleString(), color: 'text-yellow-400', icon: <Zap size={18} /> },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-3xl font-light text-white tracking-tight">Resource <span className="font-semibold text-green-400">Inspector</span></h2>
          <p className="text-[#888] mt-1">Real-time overview of natural resources and their evolution.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {statCards.map((stat, i) => (
          <div key={i} className="bg-[#121212] border border-[#222] p-6 rounded-2xl hover:border-[#444] transition-colors relative overflow-hidden group">
            <div className="absolute -right-4 -bottom-4 opacity-[0.03] group-hover:opacity-[0.05] transition-opacity scale-[3]">
              {stat.icon}
            </div>
            <div className="flex items-center gap-2 mb-4 text-[#888]">
              {stat.icon}
              <p className="text-[10px] uppercase tracking-widest">{stat.label}</p>
            </div>
            <p className={`text-3xl font-mono font-medium ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 bg-[#121212] border border-[#222] rounded-2xl p-6">
        <h3 className="text-sm font-semibold text-white mb-6 uppercase tracking-wider">Resource Distribution</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {Object.entries(stats.resourceDistribution).map(([type, qty]) => (
            <div key={type} className="flex justify-between items-end border-b border-[#333] pb-2">
              <span className="text-xs text-[#888]">{type.replace(/_/g, ' ')}</span>
              <span className="text-sm font-mono text-white">{(qty as number).toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
