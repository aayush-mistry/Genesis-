import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SimulationEvent } from '@genesis/engine';

interface EventResponse {
  upcoming?: SimulationEvent[];
  history?: SimulationEvent[];
  queueSize: number;
}

export function EventSchedulerCard() {
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useQuery<EventResponse>({
    queryKey: ['eventScheduler'],
    queryFn: async () => {
      const res = await fetch('/api/v1/events');
      if (!res.ok) throw new Error('Failed to fetch events');
      return res.json();
    },
    refetchInterval: 1000,
  });

  const scheduleEventMutation = useMutation({
    mutationFn: async (payload: any) => fetch('/api/v1/events', { 
      method: 'POST', 
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['eventScheduler'] }),
  });

  const cancelEventMutation = useMutation({
    mutationFn: async (id: string) => fetch(`/api/v1/events/${id}/cancel`, { method: 'PUT' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['eventScheduler'] }),
  });

  const clearQueueMutation = useMutation({
    mutationFn: async () => fetch('/api/v1/events/clear', { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['eventScheduler'] }),
  });

  const formatTime = (t: any) => {
    if (!t) return 'N/A';
    return `${t.hour.toString().padStart(2, '0')}:${t.minute.toString().padStart(2, '0')}:${t.second.toString().padStart(2, '0')}`;
  };

  if (isLoading) return <div className="rounded-xl border bg-card text-card-foreground shadow p-6"><div className="p-6">Loading Scheduler...</div></div>;
  
  if (isError || !data) {
    return (
      <div className="rounded-xl border shadow p-6 border-red-500/50 bg-red-500/5">
        <div className="p-6">
          <h3 className="text-lg font-medium mb-2 text-red-500">Scheduler Error</h3>
          <p className="text-sm">Failed to connect to Event Scheduler.</p>
        </div>
      </div>
    );
  }

  const { upcoming = [], history = [], queueSize } = data;

  return (
    <div className="rounded-xl border bg-card text-card-foreground shadow-sm w-full p-6">
      <div className="mb-6">
        <h3 className="text-lg font-medium">Event Scheduler</h3>
        <p className="text-sm text-muted-foreground">Manages the simulation event priority queue.</p>
      </div>
      
      <div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Status Panel */}
          <div className="bg-secondary/20 p-4 rounded-lg flex flex-col justify-center items-center">
            <p className="text-sm text-muted-foreground uppercase tracking-widest font-semibold mb-2">Queue Size</p>
            <p className="text-4xl font-light text-primary">{queueSize}</p>
          </div>

          {/* Controls */}
          <div className="flex flex-col gap-2 justify-center">
            <button 
              className="w-full text-xs h-8 inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground"
              onClick={() => scheduleEventMutation.mutate({ name: 'Wake Up', description: 'Citizen wakes up', delaySeconds: 5 })}
            >
              Test Event: Wake Up (+5s)
            </button>
            <button 
              className="w-full text-xs h-8 inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground"
              onClick={() => scheduleEventMutation.mutate({ name: 'Breakfast', description: 'Eating food', delaySeconds: 15 })}
            >
              Test Event: Breakfast (+15s)
            </button>
            <button 
              className="w-full text-xs h-8 border-primary text-primary hover:bg-primary/10 inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-background shadow-sm"
              onClick={() => scheduleEventMutation.mutate({ name: 'Daily Chime', description: 'Rings daily', delaySeconds: 10, recurrenceInterval: 'Day' })}
            >
              Recurring: Daily (+10s)
            </button>
            <button 
              className="w-full text-xs h-8 mt-2 inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90"
              onClick={() => clearQueueMutation.mutate()}
            >
              Clear Queue
            </button>
          </div>
        </div>

        <div className="mt-8 space-y-6">
          {/* Upcoming Queue */}
          <div>
            <h4 className="text-sm font-semibold border-b pb-2 mb-4">Next Upcoming Events (Max 5)</h4>
            {upcoming.length === 0 ? (
              <p className="text-xs text-muted-foreground">Queue is empty.</p>
            ) : (
              <ul className="space-y-2">
                {upcoming.slice(0, 5).map(event => (
                  <li key={event.id} className="flex justify-between items-center text-xs bg-secondary/10 p-2 rounded border border-border/50">
                    <div>
                      <span className="font-semibold text-primary mr-2">{formatTime(event.scheduledTime)}</span>
                      <span>{event.name}</span>
                      {event.recurrence && <span className="ml-2 px-1.5 py-0.5 bg-blue-500/20 text-blue-400 rounded text-[10px]">RECURS</span>}
                    </div>
                    <button 
                      className="h-6 px-2 text-[10px] text-red-400 hover:text-red-300 hover:bg-red-900/20 inline-flex items-center justify-center rounded-md font-medium transition-colors focus-visible:outline-none"
                      onClick={() => cancelEventMutation.mutate(event.id)}
                    >
                      Cancel
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* History */}
          <div>
            <h4 className="text-sm font-semibold border-b pb-2 mb-4">Recent History (Max 5)</h4>
            {history.length === 0 ? (
              <p className="text-xs text-muted-foreground">No events executed yet.</p>
            ) : (
              <ul className="space-y-2">
                {history.slice(0, 5).map(event => (
                  <li key={event.id} className="flex justify-between items-center text-xs p-2 rounded">
                    <div>
                      <span className="text-muted-foreground mr-2">{formatTime(event.executionTime || event.scheduledTime)}</span>
                      <span className={event.status === 'Cancelled' ? 'line-through text-muted-foreground' : ''}>{event.name}</span>
                    </div>
                    <span className={`text-[10px] uppercase font-bold tracking-wider ${
                      event.status === 'Completed' ? 'text-green-500' : 
                      event.status === 'Cancelled' ? 'text-yellow-500' : 'text-red-500'
                    }`}>
                      {event.status}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
