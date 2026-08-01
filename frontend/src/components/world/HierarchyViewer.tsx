import React from 'react';
import { Region, City, District, Building } from '@genesis/shared';

interface HierarchyViewerProps {
  regions: Region[];
  cities: City[];
  districts: District[];
  buildings: Building[];
}

export const HierarchyViewer: React.FC<HierarchyViewerProps> = ({ regions, cities, districts, buildings }) => {
  return (
    <div className="col-span-full rounded-xl border bg-[#1a1a1a] p-6 shadow-sm">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-white">World Hierarchy</h3>
      </div>
      <div>
        <div className="space-y-2 pl-4">
          {regions.length === 0 && <div className="text-gray-500">No regions exist in this world yet.</div>}
          
          {regions.map(region => (
            <div key={region.id} className="border-l-2 border-[#333] pl-4 py-1">
              <div className="font-semibold text-blue-400">🌍 Region: {region.name} ({region.climate})</div>
              <div className="text-xs text-gray-500 mb-2">ID: {region.id}</div>
              
              {cities.filter(c => c.regionId === region.id).map(city => (
                <div key={city.id} className="border-l-2 border-[#444] pl-4 mt-2">
                  <div className="font-medium text-emerald-400">🏙️ City: {city.name} (Pop: {city.population})</div>
                  <div className="text-xs text-gray-500 mb-2">ID: {city.id}</div>
                  
                  {districts.filter(d => d.cityId === city.id).map(district => (
                    <div key={district.id} className="border-l-2 border-[#555] pl-4 mt-2">
                      <div className="text-purple-400">🏘️ District: {district.name} [{district.type}]</div>
                      
                      <div className="mt-1 pl-4 space-y-1">
                        {buildings.filter(b => b.districtId === district.id).map(building => (
                          <div key={building.id} className="text-sm text-gray-300">
                            🏢 Building: {building.name} ({building.type}) - Cap: {building.capacity}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
