import { VitalState, Route } from './citizen';
import { EmploymentStatus } from './occupation';
import { ResourceType } from './resources';
import { SimulationTime } from './time';
import { SeasonType, WeatherType, DayPhaseType } from './environment';
import { Coordinate } from './world';

export interface SelfPerception {
  citizenId: string;
  age: number;
  vitalState: VitalState;
  employmentStatus: EmploymentStatus;
  workplaceId: string | null;
  activeRoute: Route | null;
}

export interface LocationPerception {
  worldId: string;
  regionId: string;
  cityId: string | null;
  districtId: string | null;
  buildingId: string | null;
  coordinates: Coordinate;
}

export interface EnvironmentPerception {
  season: SeasonType;
  weather: WeatherType;
  temperature: number;
  humidity: number;
  dayPhase: DayPhaseType;
}

export interface ResourcePerception {
  id: string;
  type: ResourceType;
  quantity: number;
  distance: number;
  coordinates: Coordinate;
}

export interface BuildingPerception {
  id: string;
  type: string; // e.g., 'HOME', 'WORKPLACE', 'FARM', 'HOSPITAL', etc.
  distance: number;
  coordinates: Coordinate;
}

export interface EntityPerception {
  id: string;
  type: string; // e.g., 'CITIZEN'
  distance: number;
  coordinates: Coordinate;
  relationship?: string; // e.g., 'COWORKER', 'FAMILY' - for future expansion
}

export interface SchedulePerception {
  currentTime: SimulationTime;
  currentActivity: string | null;
  nextActivity: string | null;
}

export interface PerceptionSnapshot {
  timestamp: Date;
  citizenId: string;
  self: SelfPerception;
  location: LocationPerception;
  environment: EnvironmentPerception;
  nearbyResources: ResourcePerception[];
  nearbyBuildings: BuildingPerception[];
  nearbyEntities: EntityPerception[];
  schedule: SchedulePerception;
}
