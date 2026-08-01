import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { PauseCircle, PlayCircle, XCircle, Search, RefreshCw } from 'lucide-react';
import { SimulationEvent } from '@genesis/engine';

export function QueueInspector() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');

  const { data: upcomingData, isLoading } = useQuery({
    queryKey: ['upcoming'],
    queryFn: async () => {
      const res = await fetch('/api/v1/events/upcoming');
      if (!res.ok) throw new Error('Network error');
      return res.json();
    },
    refetchInterval: 1000,
  });

  const mutation = useMutation({
    mutationFn: async ({ id, action }: { id: string, action: string }) => {
      const res = await fetch(`/api/v1/events/${id}/${action}`, { method: 'PUT' });
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['upcoming'] })
  });

  const events = upcomingData?.upcoming || [];
  
  const filteredEvents = events.filter((e: SimulationEvent) => 
    e.name.toLowerCase().includes(search.toLowerCase()) || 
    e.id.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="max-w-6xl mx-auto h-full flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-3xl font-light text-white tracking-tight">Queue <span className="font-semibold text-indigo-400">Inspector</span></h2>
          <p className="text-[#888] mt-1">{events.length} events currently scheduled.</p>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#555]" size={16} />
          <input 
            type="text" 
            placeholder="Search events..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-[#121212] border border-[#333] rounded-lg pl-9 pr-4 py-2 text-sm focus:outline-none focus:border-indigo-500 w-64 text-white placeholder-[#555] transition-colors"
          />
        </div>
      </div>

      <div className="bg-[#121212] border border-[#222] rounded-xl flex-1 overflow-hidden flex flex-col shadow-2xl">
        <div className="grid grid-cols-12 gap-4 p-4 border-b border-[#222] text-xs uppercase tracking-widest text-[#888] font-semibold bg-[#0f0f0f]">
          <div className="col-span-3">Event</div>
          <div className="col-span-3">Scheduled Time</div>
          <div className="col-span-2">Priority</div>
          <div className="col-span-2">Status</div>
          <div className="col-span-2 text-right">Actions</div>
        </div>
        
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="p-8 text-center text-[#555] flex flex-col items-center">
              <RefreshCw className="animate-spin mb-2" />
              Loading queue...
            </div>
          ) : filteredEvents.length === 0 ? (
            <div className="p-8 text-center text-[#555]">
              No events found in the queue.
            </div>
          ) : (
            filteredEvents.map((event: SimulationEvent) => (
              <div key={event.id} className="grid grid-cols-12 gap-4 p-4 border-b border-[#1a1a1a] items-center hover:bg-[#161616] transition-colors group">
                <div className="col-span-3 flex flex-col">
                  <span className="font-medium text-white truncate">{event.name}</span>
                  <span className="text-[10px] text-[#555] font-mono truncate">{event.id}</span>
                </div>
                <div className="col-span-3 font-mono text-sm text-[#aaa]">
                  {event.scheduledTime.year}-{event.scheduledTime.month}-{event.scheduledTime.day} {event.scheduledTime.hour}:{event.scheduledTime.minute}:{event.scheduledTime.second}
                </div>
                <div className="col-span-2 flex items-center">
                  <span className={`px-2 py-1 rounded text-[10px] uppercase tracking-wider font-bold ${
                    event.priority === 'Critical' ? 'bg-red-500/20 text-red-400' :
                    event.priority === 'High' ? 'bg-orange-500/20 text-orange-400' :
                    event.priority === 'Normal' ? 'bg-blue-500/20 text-blue-400' :
                    'bg-[#333] text-[#aaa]'
                  }`}>
                    {event.priority}
                  </span>
                </div>
                <div className="col-span-2 flex items-center">
                  <span className={`flex items-center gap-1.5 text-xs ${event.status === 'Paused' ? 'text-yellow-400' : 'text-green-400'}`}>
                    <div className={`w-1.5 h-1.5 rounded-full ${event.status === 'Paused' ? 'bg-yellow-400' : 'bg-green-400 animate-pulse'}`} />
                    {event.status}
                  </span>
                </div>
                <div className="col-span-2 flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  {event.status === 'Paused' ? (
                    <button onClick={() => mutation.mutate({ id: event.id, action: 'resume' })} className="text-green-400 hover:text-green-300" title="Resume">
                      <PlayCircle size={18} />
                    </button>
                  ) : (
                    <button onClick={() => mutation.mutate({ id: event.id, action: 'pause' })} className="text-yellow-400 hover:text-yellow-300" title="Pause">
                      <PauseCircle size={18} />
                    </button>
                  )}
                  <button onClick={() => mutation.mutate({ id: event.id, action: 'cancel' })} className="text-red-400 hover:text-red-300" title="Cancel">
                    <XCircle size={18} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
