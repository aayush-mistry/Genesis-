import { WorldManager } from './WorldManager';
import { RegionManager } from './RegionManager';
import { CityManager } from './CityManager';
import { DistrictManager } from './DistrictManager';
import { BuildingManager } from './BuildingManager';


export class WorldEngine {
  public worldManager: WorldManager;
  public regionManager: RegionManager;
  public cityManager: CityManager;
  public districtManager: DistrictManager;
  public buildingManager: BuildingManager;

  constructor() {
    this.worldManager = new WorldManager();
    this.regionManager = new RegionManager();
    this.cityManager = new CityManager();
    this.districtManager = new DistrictManager();
    this.buildingManager = new BuildingManager();
  }

  // Deletion orchestrations to maintain relational integrity
  public deleteRegion(regionId: string): void {
    const region = this.regionManager.getRegion(regionId);
    if (!region) return;

    // Delete all cities in this region
    region.cityIds.forEach((cityId: string) => this.deleteCity(cityId));
    
    // Remove from world
    this.worldManager.removeRegion(regionId);
    
    // Delete the region itself
    this.regionManager.deleteRegion(regionId);
  }

  public deleteCity(cityId: string): void {
    const city = this.cityManager.getCity(cityId);
    if (!city) return;

    // Delete all districts in this city
    city.districtIds.forEach((districtId: string) => this.deleteDistrict(districtId));

    // Remove from region
    this.regionManager.removeCity(city.regionId, cityId);

    // Delete the city itself
    this.cityManager.deleteCity(cityId);
  }

  public deleteDistrict(districtId: string): void {
    const district = this.districtManager.getDistrict(districtId);
    if (!district) return;

    // Delete all buildings in this district
    district.buildingIds.forEach((buildingId: string) => this.deleteBuilding(buildingId));

    // Remove from city
    this.cityManager.removeDistrict(district.cityId, districtId);

    // Delete the district itself
    this.districtManager.deleteDistrict(districtId);
  }

  public deleteBuilding(buildingId: string): void {
    const building = this.buildingManager.getBuilding(buildingId);
    if (!building) return;

    // In the future: delete rooms inside building

    // Remove from district
    this.districtManager.removeBuilding(building.districtId, buildingId);

    // Delete the building itself
    this.buildingManager.deleteBuilding(buildingId);
  }
}
