
import { useSpatialStore } from '../../stores/useSpatialStore';
import { Clock, Activity } from 'lucide-react';

export function ActivityFeed() {
  const { liveEvents, liveTime } = useSpatialStore();

  if (!liveEvents || liveEvents.length === 0) {
    return (
      <div className="absolute top-20 right-4 w-80 bg-slate-900/90 border border-slate-800 text-slate-200 shadow-xl rounded-lg overflow-hidden backdrop-blur-sm z-10 p-4">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-2 mb-2">
          <Activity size={14} /> Simulation Activity
        </h4>
        <p className="text-sm text-slate-500 italic">No recent activity.</p>
      </div>
    );
  }

  return (
    <div className="absolute top-20 right-4 w-80 bg-slate-900/90 border border-slate-800 text-slate-200 shadow-xl rounded-lg overflow-hidden backdrop-blur-sm z-10">
      <div className="p-3 bg-slate-800/50 border-b border-slate-800 flex justify-between items-center">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-2">
          <Activity size={14} /> Simulation Activity
        </h4>
        {liveTime && (
          <span className="text-xs font-mono text-slate-500 flex items-center gap-1">
            <Clock size={12} />
            {String(liveTime.hour).padStart(2, '0')}:{String(liveTime.minute).padStart(2, '0')}
          </span>
        )}
      </div>
      
      <div className="max-h-64 overflow-y-auto p-2 space-y-2">
        {liveEvents.map((event: any, idx: number) => (
          <div key={event.id || idx} className="text-sm p-2 rounded hover:bg-slate-800 transition-colors">
            <div className="flex justify-between items-start mb-1">
              <span className="font-medium text-slate-300 text-xs">
                {event.type.replace(/_/g, ' ')}
              </span>
              <span className="text-[10px] font-mono text-slate-500">
                {event.executedAtSimulationTime ? 
                  `${String(event.executedAtSimulationTime.hour).padStart(2, '0')}:${String(event.executedAtSimulationTime.minute).padStart(2, '0')}` : 
                  ''}
              </span>
            </div>
            <p className="text-xs text-slate-400 leading-snug break-words">
              {event.data?.description || JSON.stringify(event.data).slice(0, 50) + '...'}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
