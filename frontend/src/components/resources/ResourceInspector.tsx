import { ResourceStats } from './ResourceStats';
import { ResourceDashboard } from './ResourceDashboard';

export function ResourceInspector() {
  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-12">
      <ResourceStats />
      
      <div className="pt-8 border-t border-[#222]">
        <h2 className="text-2xl font-light text-white mb-6">Regional <span className="font-semibold text-green-400">Resources</span></h2>
        <ResourceDashboard />
      </div>
    </div>
  );
}
