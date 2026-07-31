import React from 'react';
import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4 text-center">
      <h2 className="text-4xl font-bold tracking-tighter sm:text-5xl">404</h2>
      <p className="text-muted-foreground text-lg">System Sector Not Found</p>
      <Link 
        to="/" 
        className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground shadow hover:bg-primary/90 h-9 px-4 py-2"
      >
        Return to Core Hub
      </Link>
    </div>
  );
}
