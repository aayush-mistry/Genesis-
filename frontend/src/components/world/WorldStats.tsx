import React from 'react';
import { World, Region, City, District, Building } from '@genesis/shared';

interface WorldStatsProps {
  world: World | null;
  regions: Region[];
  cities: City[];
  districts: District[];
  buildings: Building[];
}

export const WorldStats: React.FC<WorldStatsProps> = ({ world, regions, cities, districts, buildings }) => {
  const avgDistrictsPerCity = cities.length > 0 ? (districts.length / cities.length).toFixed(2) : 0;
  const avgBuildingsPerDistrict = districts.length > 0 ? (buildings.length / districts.length).toFixed(2) : 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <div className="rounded-xl border bg-[#1a1a1a] p-6 shadow-sm">
        <div className="flex flex-row items-center justify-between space-y-0 pb-2">
          <h3 className="text-sm font-medium text-white">Total Population</h3>
        </div>
        <div>
          <div className="text-2xl font-bold text-white">{world?.currentPopulation ?? 0}</div>
        </div>
      </div>

      <div className="rounded-xl border bg-[#1a1a1a] p-6 shadow-sm">
        <div className="flex flex-row items-center justify-between space-y-0 pb-2">
          <h3 className="text-sm font-medium text-white">Entities</h3>
        </div>
        <div>
          <div className="text-sm text-gray-300">Regions: {regions.length}</div>
          <div className="text-sm text-gray-300">Cities: {cities.length}</div>
          <div className="text-sm text-gray-300">Districts: {districts.length}</div>
          <div className="text-sm text-gray-300">Buildings: {buildings.length}</div>
        </div>
      </div>

      <div className="rounded-xl border bg-[#1a1a1a] p-6 shadow-sm">
        <div className="flex flex-row items-center justify-between space-y-0 pb-2">
          <h3 className="text-sm font-medium text-white">Averages</h3>
        </div>
        <div>
          <div className="text-sm text-gray-300">Districts / City: {avgDistrictsPerCity}</div>
          <div className="text-sm text-gray-300">Buildings / District: {avgBuildingsPerDistrict}</div>
        </div>
      </div>

      <div className="rounded-xl border bg-[#1a1a1a] p-6 shadow-sm">
        <div className="flex flex-row items-center justify-between space-y-0 pb-2">
          <h3 className="text-sm font-medium text-white">World Details</h3>
        </div>
        <div>
          <div className="text-sm text-gray-300">Seed: {world?.randomSeed ?? '-'}</div>
          <div className="text-sm text-gray-300">Climate: {world?.climateProfile ?? '-'}</div>
          <div className="text-sm text-gray-300">Size: {world?.worldSize ?? '-'}</div>
        </div>
      </div>
    </div>
  );
};
