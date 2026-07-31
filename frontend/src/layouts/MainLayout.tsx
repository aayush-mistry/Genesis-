import { Outlet } from 'react-router-dom';

export default function MainLayout() {
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <nav className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
              <span className="text-primary font-bold">G</span>
            </div>
            <h1 className="text-xl font-semibold tracking-tight">Project Genesis</h1>
          </div>
          <div className="text-sm text-muted-foreground">
            Core Engine
          </div>
        </div>
      </nav>

      <main className="flex-1 container mx-auto px-4 py-8">
        <Outlet />
      </main>

      <footer className="border-t border-border py-6 text-center text-sm text-muted-foreground">
        <p>Project Genesis &copy; {new Date().getFullYear()}</p>
        <p className="text-xs mt-1">Data first. Visualization second.</p>
      </footer>
    </div>
  );
}
