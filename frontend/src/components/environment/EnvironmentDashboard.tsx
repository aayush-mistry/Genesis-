import { useQuery } from '@tanstack/react-query';
import { getEnvironmentStatistics, getEnvironmentRegions } from '../../api/environment';
import { Cloud, Sun, Droplets, Wind, Eye, Thermometer, ArrowUpRight } from 'lucide-react';
import { EnvironmentalState } from '@genesis/shared';

export function EnvironmentDashboard() {
  const { data: statsData, isLoading: isLoadingStats } = useQuery({
    queryKey: ['envStats'],
    queryFn: getEnvironmentStatistics,
    refetchInterval: 2000,
  });

  const { data: regionsData, isLoading: isLoadingRegions } = useQuery({
    queryKey: ['envRegions'],
    queryFn: getEnvironmentRegions,
    refetchInterval: 2000,
  });

  if (isLoadingStats || isLoadingRegions) {
    return <div className="p-8 text-center text-[#555]">Loading environment data...</div>;
  }

  const {
    currentSeason = 'Unknown',
    currentPhase = 'Unknown',
    averageTemperature = 0,
    averageHumidity = 0
  } = statsData || {};

  const regions: Record<string, EnvironmentalState | null> = regionsData?.regions || {};

  return (
    <div className="max-w-7xl mx-auto h-full flex flex-col space-y-6">
      <div>
        <h2 className="text-3xl font-light text-white tracking-tight">Environment <span className="font-semibold text-emerald-400">Engine</span></h2>
        <p className="text-[#888] mt-1">Real-time planetary climate and weather simulation.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-[#121212] border border-[#222] p-6 rounded-xl flex items-center justify-between">
          <div>
            <p className="text-xs text-[#888] uppercase tracking-widest font-semibold mb-1">Season</p>
            <p className="text-2xl font-light text-white">{currentSeason}</p>
          </div>
          <Sun size={32} className="text-yellow-500 opacity-20" />
        </div>
        <div className="bg-[#121212] border border-[#222] p-6 rounded-xl flex items-center justify-between">
          <div>
            <p className="text-xs text-[#888] uppercase tracking-widest font-semibold mb-1">Day Phase</p>
            <p className="text-2xl font-light text-white">{currentPhase}</p>
          </div>
          <Cloud size={32} className="text-blue-500 opacity-20" />
        </div>
        <div className="bg-[#121212] border border-[#222] p-6 rounded-xl flex items-center justify-between">
          <div>
            <p className="text-xs text-[#888] uppercase tracking-widest font-semibold mb-1">Global Avg Temp</p>
            <p className="text-2xl font-light text-white">{averageTemperature}°C</p>
          </div>
          <Thermometer size={32} className="text-red-500 opacity-20" />
        </div>
        <div className="bg-[#121212] border border-[#222] p-6 rounded-xl flex items-center justify-between">
          <div>
            <p className="text-xs text-[#888] uppercase tracking-widest font-semibold mb-1">Global Avg Humidity</p>
            <p className="text-2xl font-light text-white">{averageHumidity}%</p>
          </div>
          <Droplets size={32} className="text-blue-400 opacity-20" />
        </div>
      </div>

      <div className="bg-[#121212] border border-[#222] rounded-xl p-6 shadow-2xl flex-1 flex flex-col">
        <h3 className="text-lg font-medium text-white mb-4">Regional Environment Data</h3>
        
        {Object.keys(regions).length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-[#555]">
            No regions created yet. Build a world in the World Engine to see local climates.
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 overflow-y-auto">
            {Object.entries(regions).map(([regionId, state]) => (
              <div key={regionId} className="bg-[#1a1a1a] border border-[#333] p-4 rounded-lg">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h4 className="text-sm font-semibold text-white">Region ID: {regionId.slice(0, 8)}...</h4>
                    <p className="text-xs text-[#888]">Calculated State</p>
                  </div>
                </div>
                
                {state ? (
                  <div className="grid grid-cols-3 gap-y-4 gap-x-2">
                    <div>
                      <p className="text-[10px] text-[#888] uppercase tracking-wider mb-1 flex items-center gap-1"><Thermometer size={10}/> Temp</p>
                      <p className="text-sm text-white font-mono">{state.temperature}°C</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-[#888] uppercase tracking-wider mb-1 flex items-center gap-1"><Droplets size={10}/> Humidity</p>
                      <p className="text-sm text-white font-mono">{state.humidity}%</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-[#888] uppercase tracking-wider mb-1 flex items-center gap-1"><Wind size={10}/> Wind</p>
                      <p className="text-sm text-white font-mono">{state.windSpeed} km/h</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-[#888] uppercase tracking-wider mb-1 flex items-center gap-1"><Eye size={10}/> Visibility</p>
                      <p className="text-sm text-white font-mono">{state.visibility} km</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-[#888] uppercase tracking-wider mb-1 flex items-center gap-1"><Cloud size={10}/> Clouds</p>
                      <p className="text-sm text-white font-mono">{state.cloudCoverage}%</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-[#888] uppercase tracking-wider mb-1 flex items-center gap-1"><ArrowUpRight size={10}/> Pressure</p>
                      <p className="text-sm text-white font-mono">{state.airPressure} hPa</p>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-[#555]">Calculating environment data...</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
