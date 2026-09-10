import { World, Region, City, District, Building, Workplace, Resource, Citizen } from '@genesis/shared';

export interface SpatialSnapshot {
  world: World;
  regions: Region[];
  cities: City[];
  districts: District[];
  buildings: Building[];
  workplaces: Workplace[];
  resources: Resource[];
  citizens: Citizen[];
  households: any[]; // Or import Household from @genesis/shared
}

export interface CameraState {
  x: number;
  y: number;
  zoom: number;
}
