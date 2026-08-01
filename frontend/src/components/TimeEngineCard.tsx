import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Play, Pause, Square } from 'lucide-react';

interface SimulationTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

interface TimeResponse {
  time: SimulationTime;
  state: 'Running' | 'Paused' | 'Stopped' | 'Reset';
  speed: number;
}

export function TimeEngineCard() {
  const queryClient = useQueryClient();
  const [customSpeed, setCustomSpeed] = useState<number>(1);

  const { data, isLoading, isError } = useQuery<TimeResponse>({
    queryKey: ['timeEngine'],
    queryFn: async () => {
      const res = await fetch('/api/v1/time');
      if (!res.ok) throw new Error('Failed to fetch time');
      return res.json();
    },
    refetchInterval: 1000, // Poll every second for live updates
  });

  const startMutation = useMutation({
    mutationFn: async () => fetch('/api/v1/time/start', { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['timeEngine'] }),
  });

  const pauseMutation = useMutation({
    mutationFn: async () => fetch('/api/v1/time/pause', { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['timeEngine'] }),
  });

  const resumeMutation = useMutation({
    mutationFn: async () => fetch('/api/v1/time/resume', { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['timeEngine'] }),
  });

  const resetMutation = useMutation({
    mutationFn: async () => fetch('/api/v1/time/reset', { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['timeEngine'] }),
  });

  const speedMutation = useMutation({
    mutationFn: async (speed: number) => {
      const res = await fetch('/api/v1/time/speed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ speed }),
      });
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['timeEngine'] }),
  });

  const handleSpeedChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCustomSpeed(Number(e.target.value));
  };

  const applySpeed = () => {
    speedMutation.mutate(customSpeed);
  };

  if (isLoading) {
    return (
      <div className="rounded-xl border bg-card text-card-foreground shadow mt-8 p-6 animate-pulse">
        <h3 className="text-lg font-medium mb-4">Time Engine</h3>
        <div className="h-20 bg-muted rounded-md mb-4" />
        <div className="h-10 bg-muted rounded-md w-1/2" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="rounded-xl border bg-card text-card-foreground shadow mt-8 p-6 border-red-500">
        <h3 className="text-lg font-medium mb-2 text-red-500">Time Engine Error</h3>
        <p className="text-sm">Failed to connect to the Time Engine backend.</p>
      </div>
    );
  }

  const { time, state, speed } = data;

  const pad = (n: number) => n.toString().padStart(2, '0');
  const formattedTime = `Year ${time.year}, Month ${pad(time.month)}, Day ${pad(time.day)} - ${pad(time.hour)}:${pad(time.minute)}:${pad(time.second)}`;

  return (
    <div className="rounded-xl border bg-card text-card-foreground shadow mt-8 overflow-hidden">
      <div className="p-6 border-b border-border bg-muted/40">
        <div className="flex justify-between items-center">
          <h3 className="text-xl font-semibold flex items-center gap-2">
            Time Engine
            <span className={`inline-block w-2.5 h-2.5 rounded-full shadow-[0_0_8px_rgba(255,255,255,0.4)] ${state === 'Running' ? 'bg-green-500 animate-pulse' : state === 'Paused' ? 'bg-yellow-500' : 'bg-red-500'}`} />
          </h3>
          <span className="text-xs font-mono bg-background px-2 py-1 rounded border">
            {state.toUpperCase()}
          </span>
        </div>
      </div>
      
      <div className="p-6">
        <div className="text-center mb-8">
          <p className="text-sm text-muted-foreground uppercase tracking-widest mb-2 font-semibold">Current Simulation Time</p>
          <div className="text-3xl md:text-5xl font-mono font-bold tracking-tight bg-gradient-to-br from-white to-gray-400 bg-clip-text text-transparent drop-shadow-sm">
            {formattedTime}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Controls */}
          <div className="space-y-4">
            <p className="text-sm font-medium text-muted-foreground mb-2">Controls</p>
            <div className="flex flex-wrap gap-2">
              {state === 'Stopped' || state === 'Reset' ? (
                <button 
                  onClick={() => startMutation.mutate()}
                  className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90 transition-colors font-medium shadow-sm"
                >
                  <Play size={16} /> Start
                </button>
              ) : state === 'Paused' ? (
                <button 
                  onClick={() => resumeMutation.mutate()}
                  className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 transition-colors font-medium shadow-sm"
                >
                  <Play size={16} /> Resume
                </button>
              ) : (
                <button 
                  onClick={() => pauseMutation.mutate()}
                  className="flex items-center gap-2 bg-yellow-600 text-white px-4 py-2 rounded-md hover:bg-yellow-700 transition-colors font-medium shadow-sm"
                >
                  <Pause size={16} /> Pause
                </button>
              )}
              
              <button 
                onClick={() => resetMutation.mutate()}
                className="flex items-center gap-2 bg-destructive text-destructive-foreground px-4 py-2 rounded-md hover:bg-destructive/90 transition-colors font-medium shadow-sm"
              >
                <Square size={16} /> Stop & Reset
              </button>
            </div>
          </div>

          {/* Speed settings */}
          <div className="space-y-4">
            <p className="text-sm font-medium text-muted-foreground mb-2">Simulation Speed (multiplier)</p>
            <div className="flex gap-2 items-center">
              <span className="text-xl font-mono font-bold w-16">{speed}x</span>
              <div className="flex gap-2">
                <input 
                  type="number" 
                  min="1" 
                  value={customSpeed} 
                  onChange={handleSpeedChange}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 max-w-[100px]"
                />
                <button 
                  onClick={applySpeed}
                  className="bg-secondary text-secondary-foreground px-4 py-2 rounded-md hover:bg-secondary/80 transition-colors font-medium"
                >
                  Set Speed
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
