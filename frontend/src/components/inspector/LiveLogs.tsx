import { useQuery } from '@tanstack/react-query';
import { useRef, useEffect, useState } from 'react';
import { Terminal, ArrowDown } from 'lucide-react';

export function LiveLogs() {
  const [autoScroll, setAutoScroll] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  
  const { data: logsData } = useQuery({
    queryKey: ['logs'],
    queryFn: async () => {
      const res = await fetch('/api/v1/events/logs');
      if (!res.ok) throw new Error('Network error');
      return res.json();
    },
    refetchInterval: 500, // Fast polling for "live" feel
  });

  const logs = logsData?.logs || [];
  
  // The logs come from backend as unshift (newest first). Let's reverse them for standard terminal output
  const displayLogs = [...logs].reverse();

  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [displayLogs, autoScroll]);

  return (
    <div className="max-w-5xl mx-auto h-full flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-3xl font-light text-white tracking-tight">Engine <span className="font-semibold text-indigo-400">Live Logs</span></h2>
          <p className="text-[#888] mt-1">Real-time terminal output from the Event Scheduler.</p>
        </div>
        
        <button 
          onClick={() => setAutoScroll(!autoScroll)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs font-medium border transition-colors ${
            autoScroll ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400' : 'bg-transparent border-[#333] text-[#888] hover:text-white'
          }`}
        >
          <ArrowDown size={14} />
          Auto-scroll
        </button>
      </div>

      <div className="bg-black border border-[#222] rounded-xl flex-1 flex flex-col overflow-hidden shadow-2xl relative font-mono">
        <div className="h-8 bg-[#111] border-b border-[#222] flex items-center px-4 gap-2">
          <Terminal size={14} className="text-[#666]" />
          <span className="text-xs text-[#666]">/genesis/engine/stdout</span>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-1">
          {displayLogs.length === 0 ? (
            <div className="text-[#444] text-sm">Waiting for logs...</div>
          ) : (
            displayLogs.map((log: { message: string, timestamp: number }, i: number) => {
              const isTick = log.message.includes('Tick');
              const isError = log.message.toLowerCase().includes('error') || log.message.toLowerCase().includes('fail');
              
              return (
                <div key={i} className="flex gap-4 text-xs lg:text-sm hover:bg-[#111] px-2 py-0.5 -mx-2 rounded transition-colors">
                  <span className="text-[#555] whitespace-nowrap">
                    {new Date(log.timestamp).toLocaleTimeString(undefined, { hour12: false })}
                  </span>
                  <span className={`whitespace-pre-wrap break-all ${
                    isError ? 'text-red-400' : 
                    isTick ? 'text-indigo-300 font-semibold' : 
                    'text-[#aaa]'
                  }`}>
                    {log.message}
                  </span>
                </div>
              );
            })
          )}
          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  );
}
