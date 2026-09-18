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

export interface DynamicSpatialState {
  time: any; // SimulationTime
  citizens: SpatialCitizen[];
  populationClusters: any[];
}

export interface SpatialCitizen extends Citizen {
  x: number;
  y: number;
  destinationX?: number;
  destinationY?: number;
  travelProgress?: number;
}

export interface CameraState {
  x: number;
  y: number;
  zoom: number;
}
