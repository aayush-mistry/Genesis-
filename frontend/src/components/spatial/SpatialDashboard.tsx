import { useQuery } from '@tanstack/react-query';
import { spatialApi } from '../../api/spatial';
import { Map, Target, Circle, Activity } from 'lucide-react';
import { useState } from 'react';

export function SpatialDashboard() {
  const [queryX, setQueryX] = useState<number>(0);
  const [queryY, setQueryY] = useState<number>(0);
  const [queryRadius, setQueryRadius] = useState<number>(1000);
  const [queryType, setQueryType] = useState<string>('');
  const [queryMode, setQueryMode] = useState<'nearby' | 'nearest'>('nearby');

  const { data: stats, isLoading: isLoadingStats } = useQuery({
    queryKey: ['spatialStats'],
    queryFn: spatialApi.getStatistics,
    refetchInterval: 2000,
  });

  const { data: queryResults, isLoading: isLoadingQuery, refetch: runQuery } = useQuery({
    queryKey: ['spatialQuery', queryMode, queryX, queryY, queryRadius, queryType],
    queryFn: async () => {
      if (queryMode === 'nearby') {
        const results = await spatialApi.getNearby(queryX, queryY, queryRadius, queryType || undefined, 100);
        return Array.isArray(results) ? results : [];
      } else {
        const result = await spatialApi.getNearest(queryX, queryY, queryType || undefined);
        return result ? [result] : [];
      }
    },
    enabled: false,
  });

  return (
    <div className="max-w-7xl mx-auto h-full flex flex-col space-y-6">
      <div>
        <h2 className="text-3xl font-light text-white tracking-tight">Spatial <span className="font-semibold text-purple-400">Engine</span></h2>
        <p className="text-[#888] mt-1">High-performance spatial index and coordinate relationships.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-[#121212] border border-[#222] p-6 rounded-xl flex items-center justify-between">
          <div>
            <p className="text-xs text-[#888] uppercase tracking-widest font-semibold mb-1">Indexed Entities</p>
            <p className="text-2xl font-light text-white">
              {isLoadingStats ? '...' : stats?.indexedEntities?.toLocaleString() || 0}
            </p>
          </div>
          <Map size={32} className="text-purple-500 opacity-20" />
        </div>
        <div className="bg-[#121212] border border-[#222] p-6 rounded-xl flex items-center justify-between">
          <div>
            <p className="text-xs text-[#888] uppercase tracking-widest font-semibold mb-1">Grid Cells</p>
            <p className="text-2xl font-light text-white">
              {isLoadingStats ? '...' : stats?.gridCells?.toLocaleString() || 0}
            </p>
          </div>
          <Activity size={32} className="text-green-500 opacity-20" />
        </div>
        <div className="bg-[#121212] border border-[#222] p-6 rounded-xl flex items-center justify-between">
          <div>
            <p className="text-xs text-[#888] uppercase tracking-widest font-semibold mb-1">Avg per Cell</p>
            <p className="text-2xl font-light text-white">
              {isLoadingStats ? '...' : stats?.entitiesPerCellAvg || 0}
            </p>
          </div>
          <Circle size={32} className="text-blue-500 opacity-20" />
        </div>
        <div className="bg-[#121212] border border-[#222] p-6 rounded-xl flex items-center justify-between">
          <div>
            <p className="text-xs text-[#888] uppercase tracking-widest font-semibold mb-1">Index Status</p>
            <p className="text-2xl font-light text-emerald-400">
              {isLoadingStats ? '...' : stats?.indexStatus || 'Unknown'}
            </p>
          </div>
          <Target size={32} className="text-emerald-500 opacity-20" />
        </div>
      </div>

      <div className="bg-[#121212] border border-[#222] rounded-xl p-6 shadow-2xl flex-1 flex flex-col">
        <h3 className="text-lg font-medium text-white mb-4">Spatial Query Inspector</h3>
        
        <div className="flex flex-wrap gap-4 mb-6 p-4 bg-[#1a1a1a] border border-[#333] rounded-lg items-end">
          <div>
            <label className="block text-xs text-[#888] mb-1">Mode</label>
            <select 
              className="bg-[#222] border border-[#444] text-white text-sm rounded px-3 py-2 w-32 focus:outline-none focus:border-purple-500"
              value={queryMode}
              onChange={(e) => setQueryMode(e.target.value as any)}
            >
              <option value="nearby">Radius (Nearby)</option>
              <option value="nearest">Nearest Entity</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-[#888] mb-1">X Coord</label>
            <input 
              type="number" 
              className="bg-[#222] border border-[#444] text-white text-sm rounded px-3 py-2 w-24 focus:outline-none focus:border-purple-500"
              value={queryX}
              onChange={(e) => setQueryX(Number(e.target.value))}
            />
          </div>
          <div>
            <label className="block text-xs text-[#888] mb-1">Y Coord</label>
            <input 
              type="number" 
              className="bg-[#222] border border-[#444] text-white text-sm rounded px-3 py-2 w-24 focus:outline-none focus:border-purple-500"
              value={queryY}
              onChange={(e) => setQueryY(Number(e.target.value))}
            />
          </div>
          
          {queryMode === 'nearby' && (
            <div>
              <label className="block text-xs text-[#888] mb-1">Radius</label>
              <input 
                type="number" 
                className="bg-[#222] border border-[#444] text-white text-sm rounded px-3 py-2 w-24 focus:outline-none focus:border-purple-500"
                value={queryRadius}
                onChange={(e) => setQueryRadius(Number(e.target.value))}
              />
            </div>
          )}

          <div>
            <label className="block text-xs text-[#888] mb-1">Type Filter (Optional)</label>
            <select 
              className="bg-[#222] border border-[#444] text-white text-sm rounded px-3 py-2 w-32 focus:outline-none focus:border-purple-500"
              value={queryType}
              onChange={(e) => setQueryType(e.target.value)}
            >
              <option value="">Any Type</option>
              <option value="CITY">City</option>
              <option value="BUILDING">Building</option>
            </select>
          </div>

          <button 
            className="bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium py-2 px-4 rounded transition-colors"
            onClick={() => runQuery()}
            disabled={isLoadingQuery}
          >
            {isLoadingQuery ? 'Running...' : 'Run Query'}
          </button>
        </div>

        <div className="flex-1 border border-[#333] rounded-lg overflow-hidden bg-[#1a1a1a]">
          {queryResults && queryResults.length > 0 ? (
            <div className="overflow-y-auto max-h-[400px]">
              <table className="w-full text-left border-collapse">
                <thead className="bg-[#222] sticky top-0">
                  <tr>
                    <th className="p-3 text-xs text-[#888] font-medium border-b border-[#333]">Entity ID</th>
                    <th className="p-3 text-xs text-[#888] font-medium border-b border-[#333]">Type</th>
                    <th className="p-3 text-xs text-[#888] font-medium border-b border-[#333]">Position</th>
                    <th className="p-3 text-xs text-[#888] font-medium border-b border-[#333]">Distance</th>
                  </tr>
                </thead>
                <tbody>
                  {queryResults.map((entity: any) => (
                    <tr key={entity.id} className="border-b border-[#333] hover:bg-[#222] transition-colors">
                      <td className="p-3 text-sm text-white font-mono">{entity.id.split('-')[0]}...</td>
                      <td className="p-3 text-sm">
                        <span className="bg-[#333] text-gray-300 px-2 py-1 rounded text-xs">
                          {entity.type}
                        </span>
                      </td>
                      <td className="p-3 text-sm text-[#ccc] font-mono">
                        {Math.round(entity.position.x)}, {Math.round(entity.position.y)}
                      </td>
                      <td className="p-3 text-sm text-purple-400 font-mono">
                        {entity.distance ? entity.distance.toFixed(2) : '-'} units
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : queryResults ? (
            <div className="h-full flex items-center justify-center text-[#555]">
              No entities found matching the query.
            </div>
          ) : (
            <div className="h-full flex items-center justify-center text-[#555]">
              Configure parameters and run a spatial query to see results.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
