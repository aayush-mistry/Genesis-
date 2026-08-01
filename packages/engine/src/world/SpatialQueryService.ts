import { Coordinate, WorldEntity } from '@genesis/shared';
import { RegionManager } from './RegionManager';
import { CityManager } from './CityManager';
import { DistrictManager } from './DistrictManager';
import { BuildingManager } from './BuildingManager';

export class SpatialQueryService {
  constructor(
    private regionManager: RegionManager,
    private cityManager: CityManager,
    private districtManager: DistrictManager,
    private buildingManager: BuildingManager
  ) {}

  private calculateDistance(c1: Coordinate, c2: Coordinate): number {
    return Math.sqrt(Math.pow(c1.x - c2.x, 2) + Math.pow(c1.y - c2.y, 2));
  }

  public findNearbyBuildings(coord: Coordinate, radius: number) {
    const buildings = this.buildingManager.getAllBuildings();
    return buildings.filter(b => this.calculateDistance(b.coordinates, coord) <= radius);
  }

  public findNearbyCities(coord: Coordinate, radius: number) {
    const cities = this.cityManager.getAllCities();
    return cities.filter(c => this.calculateDistance(c.coordinates, coord) <= radius);
  }

  public findNearestBuilding(coord: Coordinate) {
    const buildings = this.buildingManager.getAllBuildings();
    if (buildings.length === 0) return null;

    return buildings.reduce((nearest, building) => {
      const dist = this.calculateDistance(building.coordinates, coord);
      const nearestDist = this.calculateDistance(nearest.coordinates, coord);
      return dist < nearestDist ? building : nearest;
    }, buildings[0]);
  }
}
