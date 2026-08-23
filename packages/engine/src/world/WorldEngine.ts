import { WorldManager } from './WorldManager';
import { RegionManager } from './RegionManager';
import { CityManager } from './CityManager';
import { DistrictManager } from './DistrictManager';
import { BuildingManager } from './BuildingManager';
import { WorkplaceRepository } from './repositories/WorkplaceRepository';
import { FoodDistributionManager } from './services/FoodDistributionManager';
import { WorkplaceGenerator } from './services/WorkplaceGenerator';

export class WorldEngine {
  public worldManager: WorldManager;
  public regionManager: RegionManager;
  public cityManager: CityManager;
  public districtManager: DistrictManager;
  public buildingManager: BuildingManager;
  public workplaceRepository: WorkplaceRepository;
  public workplaceGenerator: WorkplaceGenerator;
  public foodDistributionManager: FoodDistributionManager;

  constructor() {
    this.worldManager = new WorldManager();
    this.regionManager = new RegionManager();
    this.cityManager = new CityManager();
    this.districtManager = new DistrictManager();
    this.buildingManager = new BuildingManager();
    this.workplaceRepository = new WorkplaceRepository();
    this.workplaceGenerator = new WorkplaceGenerator(this, this.workplaceRepository);
    this.foodDistributionManager = new FoodDistributionManager(this);
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

  /**
   * Resolves any valid spatial entity ID to its exact Coordinates.
   * Districts typically don't have their own distinct coordinates in this model, so we fall back to the City.
   */
  public getEntityCoordinates(entityId: string): import('@genesis/shared').Coordinate | undefined {
    const building = this.buildingManager.getBuilding(entityId);
    if (building) return building.coordinates;

    const city = this.cityManager.getCity(entityId);
    if (city) return city.coordinates;

    const region = this.regionManager.getRegion(entityId);
    if (region) return region.coordinates;

    const district = this.districtManager.getDistrict(entityId);
    if (district) {
      const parentCity = this.cityManager.getCity(district.cityId);
      if (parentCity) return parentCity.coordinates;
    }

    return undefined;
  }
  public resolveLocationHierarchy(locationId: string | null): { regionId?: string, cityId?: string, districtId?: string, buildingId?: string } {
    if (!locationId) return {};

    const region = this.regionManager.getRegion(locationId);
    if (region) return { regionId: region.id };

    const city = this.cityManager.getCity(locationId);
    if (city) return { regionId: city.regionId, cityId: city.id };

    const district = this.districtManager.getDistrict(locationId);
    if (district) {
      const parentCity = this.cityManager.getCity(district.cityId);
      if (parentCity) return { regionId: parentCity.regionId, cityId: parentCity.id, districtId: district.id };
    }

    const building = this.buildingManager.getBuilding(locationId);
    if (building) {
      const parentDistrict = this.districtManager.getDistrict(building.districtId);
      if (parentDistrict) {
        const parentCity = this.cityManager.getCity(parentDistrict.cityId);
        if (parentCity) return { regionId: parentCity.regionId, cityId: parentCity.id, districtId: parentDistrict.id, buildingId: building.id };
      }
    }

    return {};
  }
}
