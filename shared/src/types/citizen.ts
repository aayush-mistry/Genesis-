import { SimulationTime } from './time';

export enum CitizenStatus {
  ACTIVE = 'ACTIVE',
  DECEASED = 'DECEASED'
}

export enum CitizenGender {
  MALE = 'MALE',
  FEMALE = 'FEMALE',
  OTHER = 'OTHER'
}

export interface VitalState {
  hunger: number;
  thirst: number;
  energy: number;
  health: number;
  lastUpdatedSimulationTime: SimulationTime;
}

export enum MovementState {
  IDLE = 'IDLE',
  TRAVELLING = 'TRAVELLING'
}

export interface Route {
  id: string;
  sourceId: string;
  destinationId: string;
  path: string[];
  status: 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
  createdAtSimulationTime: SimulationTime;
  startedAtSimulationTime: SimulationTime;
  expectedArrivalSimulationTime: SimulationTime;
  estimatedTravelDurationHours: number;
}

export interface Citizen {
  id: string;
  name: string;
  birthDate: SimulationTime;
  gender: CitizenGender;
  status: CitizenStatus;
  createdAt: SimulationTime;
  locationId: string | null;
  vitalState: VitalState;
  movementState: MovementState;
  activeRoute: Route | null;
}
