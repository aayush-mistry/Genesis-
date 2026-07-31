import { GENESIS_CONFIG } from '@genesis/shared';
import { useQuery } from '@tanstack/react-query';

export default function Home() {
  const { data: health, isLoading, isError } = useQuery({
    queryKey: ['health'],
    queryFn: async () => {
      const res = await fetch('/api/v1/health');
      if (!res.ok) throw new Error('Network response was not ok');
      return res.json();
    }
  });

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header className="space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">System Overview</h2>
        <p className="text-muted-foreground">
          Current Phase: <span className="text-foreground font-medium">{GENESIS_CONFIG.PHASE}</span>
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* Frontend Status */}
        <div className="rounded-xl border bg-card text-card-foreground shadow">
          <div className="p-6 flex flex-row items-center justify-between space-y-0 pb-2">
            <h3 className="tracking-tight text-sm font-medium">Frontend</h3>
            <div className="h-3 w-3 rounded-full bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)] animate-pulse" />
          </div>
          <div className="p-6 pt-0">
            <div className="text-2xl font-bold">Online</div>
            <p className="text-xs text-muted-foreground mt-1">React Client Active</p>
          </div>
        </div>

        {/* Backend Status */}
        <div className="rounded-xl border bg-card text-card-foreground shadow">
          <div className="p-6 flex flex-row items-center justify-between space-y-0 pb-2">
            <h3 className="tracking-tight text-sm font-medium">Backend</h3>
            <div className={`h-3 w-3 rounded-full shadow-[0_0_10px_rgba(34,197,94,0.5)] ${isLoading ? 'bg-yellow-500 animate-pulse' : isError ? 'bg-red-500' : 'bg-green-500'}`} />
          </div>
          <div className="p-6 pt-0">
            <div className="text-2xl font-bold">
              {isLoading ? 'Checking...' : isError ? 'Offline' : 'Online'}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              API Server {health?.version ? `v${health.version}` : ''}
            </p>
          </div>
        </div>

        {/* Database Status */}
        <div className="rounded-xl border bg-card text-card-foreground shadow">
          <div className="p-6 flex flex-row items-center justify-between space-y-0 pb-2">
            <h3 className="tracking-tight text-sm font-medium">Database</h3>
            <div className={`h-3 w-3 rounded-full shadow-[0_0_10px_rgba(34,197,94,0.5)] ${isLoading ? 'bg-yellow-500 animate-pulse' : health?.services?.database === 'ONLINE' ? 'bg-green-500' : 'bg-red-500'}`} />
          </div>
          <div className="p-6 pt-0">
            <div className="text-2xl font-bold">
              {isLoading ? 'Checking...' : health?.services?.database === 'ONLINE' ? 'Ready' : 'Error'}
            </div>
            <p className="text-xs text-muted-foreground mt-1">SQLite Storage</p>
          </div>
        </div>
      </div>
      
      <div className="rounded-xl border bg-card text-card-foreground shadow mt-8 p-6">
         <h3 className="text-lg font-medium mb-2">Engine Philosophy</h3>
         <blockquote className="border-l-2 border-primary pl-4 italic text-muted-foreground">
           "Data first. Visualization second."
         </blockquote>
         <p className="mt-4 text-sm">
           This dashboard is a minimal placeholder. The core focus of Project Genesis is the decoupled simulation engine running in the backend.
         </p>
      </div>
    </div>
  );
}
