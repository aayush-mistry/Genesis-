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

export interface PersonalityTraits {
  priceSensitivity: number; // 0-100
  qualityPreference: number; // 0-100
  conveniencePreference: number; // 0-100
  planningTendency: number; // 0-100
  socialEngagement: number; // 0-100
  riskTolerance: number; // 0-100
  savingTendency: number; // 0-100
}

export interface Household {
  id: string;
  locationId: string;
  inventoryId: string;
  walletId: string;
  members: string[]; // Citizen IDs
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
  wallet: import('./market').Wallet;
  movementState: MovementState;
  activeRoute: Route | null;
  skills: import('./occupation').Skill[];
  employmentStatus: import('./occupation').EmploymentStatus;
  workplaceId: string | null;
  jobType: import('./occupation').JobType | null;
  jobSchedule: import('./occupation').WorkSchedule | null;
  currentAction?: import('./execution').ActionInstance;
  currentRoutine?: import('./routine').CitizenRoutine;
  currentRoutineActivity?: import('./routine').RoutineActivity;
  householdId?: string;
  personality: PersonalityTraits;
  employmentRecord?: {
    daysWorked: number;
    expectedWorkingDays: number;
    performanceScore: number;
    startDate: import('./time').SimulationTime;
    endDate: import('./time').SimulationTime | null;
    lastPaymentDate: import('./time').SimulationTime | null;
  };
}
