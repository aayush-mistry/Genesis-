import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Search, Filter } from 'lucide-react';

export function HistoryInspector() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const { data: historyData } = useQuery({
    queryKey: ['history', search, statusFilter],
    queryFn: async () => {
      let url = '/api/v1/events/history?limit=1000';
      if (search) url += `&search=${encodeURIComponent(search)}`;
      if (statusFilter) url += `&status=${encodeURIComponent(statusFilter)}`;
      
      const res = await fetch(url);
      if (!res.ok) throw new Error('Network error');
      return res.json();
    },
    refetchInterval: 2000,
  });

  const history = historyData?.history || [];

  return (
    <div className="max-w-7xl mx-auto h-full flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-3xl font-light text-white tracking-tight">Execution <span className="font-semibold text-indigo-400">History</span></h2>
          <p className="text-[#888] mt-1">Viewing last 1000 events</p>
        </div>
        
        <div className="flex gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#555]" size={16} />
            <input 
              type="text" 
              placeholder="Search history..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-[#121212] border border-[#333] rounded-lg pl-9 pr-4 py-2 text-sm focus:outline-none focus:border-indigo-500 w-64 text-white placeholder-[#555]"
            />
          </div>
          
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-[#555]" size={16} />
            <select 
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-[#121212] border border-[#333] rounded-lg pl-9 pr-8 py-2 text-sm focus:outline-none focus:border-indigo-500 text-white appearance-none"
            >
              <option value="">All Statuses</option>
              <option value="Completed">Completed</option>
              <option value="Failed">Failed</option>
              <option value="Cancelled">Cancelled</option>
            </select>
          </div>
        </div>
      </div>

      <div className="bg-[#121212] border border-[#222] rounded-xl flex-1 overflow-hidden flex flex-col shadow-2xl">
        <div className="grid grid-cols-12 gap-4 p-4 border-b border-[#222] text-[10px] uppercase tracking-widest text-[#888] font-semibold bg-[#0f0f0f]">
          <div className="col-span-3">Event</div>
          <div className="col-span-2">Time (Sim)</div>
          <div className="col-span-2">Module</div>
          <div className="col-span-2">Duration</div>
          <div className="col-span-3">Status / Result</div>
        </div>
        
        <div className="flex-1 overflow-y-auto">
          {history.length === 0 ? (
            <div className="p-8 text-center text-[#555]">
              No events found in history matching your criteria.
            </div>
          ) : (
            history.map((event: any, index: number) => (
              <div key={index} className="grid grid-cols-12 gap-4 p-4 border-b border-[#1a1a1a] items-center hover:bg-[#161616] transition-colors">
                <div className="col-span-3 flex flex-col">
                  <span className="font-medium text-white truncate">{event.name}</span>
                  <span className="text-[10px] text-[#555] font-mono truncate">{event.id}</span>
                </div>
                
                <div className="col-span-2 flex flex-col">
                  <span className="font-mono text-sm text-[#aaa]">
                    {event.executionTime ? `${event.executionTime.year}-${event.executionTime.month}-${event.executionTime.day}` : '-'}
                  </span>
                  <span className="text-xs text-[#666] font-mono">
                    {event.executionTime ? `${event.executionTime.hour}:${event.executionTime.minute}:${event.executionTime.second}` : ''}
                  </span>
                </div>
                
                <div className="col-span-2 flex items-center">
                  <span className="text-xs text-[#888] border border-[#333] px-2 py-0.5 rounded-full">{event.targetModule}</span>
                </div>
                
                <div className="col-span-2 font-mono text-xs text-[#aaa]">
                  {event.executionDurationMs !== undefined ? `${event.executionDurationMs.toFixed(2)} ms` : '-'}
                </div>
                
                <div className="col-span-3 flex flex-col justify-center">
                  <span className={`text-sm ${
                    event.status === 'Completed' ? 'text-green-400' :
                    event.status === 'Failed' ? 'text-red-400' :
                    'text-yellow-400'
                  }`}>
                    {event.status}
                  </span>
                  {event.executionResult && event.status === 'Failed' && (
                    <span className="text-[10px] text-red-500 truncate" title={String(event.executionResult)}>
                      {String(event.executionResult)}
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
