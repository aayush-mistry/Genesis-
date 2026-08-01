import React, { useEffect, useState } from 'react';
import { worldApi } from '../../api/world';
import { World, Region, City, District, Building } from '@genesis/shared';
import { WorldStats } from './WorldStats';
import { HierarchyViewer } from './HierarchyViewer';
import { PlayCircle, Trash2 } from 'lucide-react';

export const WorldDashboard: React.FC = () => {
  const [world, setWorld] = useState<World | null>(null);
  const [regions, setRegions] = useState<Region[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [districts, setDistricts] = useState<District[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchWorldData = async () => {
    try {
      setLoading(true);
      const w = await worldApi.getWorld().catch(() => null);
      setWorld(w);
      if (w) {
        setRegions(await worldApi.getRegions());
        setCities(await worldApi.getCities());
        setDistricts(await worldApi.getDistricts());
        setBuildings(await worldApi.getBuildings());
      } else {
        setRegions([]);
        setCities([]);
        setDistricts([]);
        setBuildings([]);
      }
    } catch (error) {
      console.error('Error fetching world data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWorldData();
  }, []);

  const handleCreateWorld = async () => {
    await worldApi.createWorld({
      name: 'Genesis Prime',
      description: 'The first simulation world.',
      seed: Math.floor(Math.random() * 1000000),
    });
    fetchWorldData();
  };

  const handleDestroyWorld = async () => {
    await worldApi.deleteWorld();
    fetchWorldData();
  };

  if (loading) {
    return <div className="p-4 text-gray-500">Loading world data...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold tracking-tight text-white">World Engine</h2>
        <div className="flex gap-2">
          {!world ? (
            <button onClick={handleCreateWorld} className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 transition-colors font-medium shadow-sm">
              <PlayCircle className="w-4 h-4" />
              Initialize World
            </button>
          ) : (
            <button onClick={handleDestroyWorld} className="flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 transition-colors font-medium shadow-sm">
              <Trash2 className="w-4 h-4" />
              Destroy World
            </button>
          )}
        </div>
      </div>

      {!world ? (
        <div className="rounded-xl border border-dashed border-2 bg-transparent text-center p-12">
          <div className="flex flex-col items-center justify-center space-y-4">
            <div className="text-4xl">🌍</div>
            <h3 className="text-xl font-semibold">No World Initialized</h3>
            <p className="text-gray-500 max-w-sm text-center">
              The World Engine is currently empty. Initialize a new world to start the spatial simulation.
            </p>
          </div>
        </div>
      ) : (
        <>
          <WorldStats
            world={world}
            regions={regions}
            cities={cities}
            districts={districts}
            buildings={buildings}
          />
          <div className="grid grid-cols-1 gap-6">
            <HierarchyViewer
              regions={regions}
              cities={cities}
              districts={districts}
              buildings={buildings}
            />
          </div>
        </>
      )}
    </div>
  );
};
