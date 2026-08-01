import { Outlet } from 'react-router-dom';

export default function MainLayout() {
  return (
    <div className="h-screen w-screen overflow-hidden flex bg-background text-foreground selection:bg-primary/20">
      <Outlet />
    </div>
  );
}
