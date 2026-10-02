
import { useSpatialStore } from '../../stores/useSpatialStore';
import { Clock, Activity } from 'lucide-react';

export function ActivityFeed() {
  const { liveEvents, liveTime } = useSpatialStore();

  const validEvents = liveEvents?.filter((e: any) => e && e.type && String(e.type).trim() !== '') || [];

  if (validEvents.length === 0) {
    return (
      <div className="w-full bg-slate-900/90 border-b border-slate-800 text-slate-200 p-4 flex-shrink-0">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-2 mb-2">
          <Activity size={14} /> Simulation Activity
        </h4>
        <p className="text-sm font-semibold text-slate-300 mt-4 uppercase">No recent activity</p>
        <p className="text-xs text-slate-500 italic mt-1">The simulation is running.</p>
      </div>
    );
  }

  return (
    <div className="w-full bg-slate-900/90 border-b border-slate-800 text-slate-200 overflow-hidden flex flex-col flex-shrink-0">
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
      <div className="flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar pointer-events-auto">
        {validEvents.map((event: any, idx: number) => {
          const title = event.type ? String(event.type).replace(/_/g, ' ') : 'Event';
          const description = event.data?.description || (event.data ? String(JSON.stringify(event.data) || '').slice(0, 50) + '...' : '');
          if (!event.type && !description) return null;
          
          return (
            <div key={event.id || idx} className="text-sm p-2 rounded hover:bg-slate-800 transition-colors">
              <div className="flex justify-between items-start mb-1">
                <span className="font-medium text-slate-300 text-xs">
                  {title}
                </span>
                <span className="text-[10px] font-mono text-slate-500">
                  {event.executedAtSimulationTime ? 
                    `${String(event.executedAtSimulationTime.hour).padStart(2, '0')}:${String(event.executedAtSimulationTime.minute).padStart(2, '0')}` : 
                    ''}
                </span>
              </div>
              {description && (
                <p className="text-xs text-slate-400 leading-snug break-words">
                  {description}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
