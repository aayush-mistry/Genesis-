import { World, Region, City, District, Building, Workplace, Resource, Citizen } from '@genesis/shared';

export interface SpatialSnapshot {
  world: World;
  regions: Region[];
  cities: City[];
  districts: District[];
  buildings: Building[];
  workplaces: Workplace[];
  resources: Resource[];
  terrain: any[]; // Or import Terrain from @genesis/shared
  citizens: Citizen[];
  households: any[]; // Or import Household from @genesis/shared
  populationClusters?: any[];
}

export interface CameraState {
  x: number;
  y: number;
  zoom: number;
}
