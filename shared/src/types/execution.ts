import { SimulationTime } from './time';
import { ActionType } from './decision';

export enum ActionState {
  PENDING = 'PENDING',
  STARTED = 'STARTED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
  TRAVELING = 'TRAVELING',
  SHOPPING = 'SHOPPING',
  PURCHASING = 'PURCHASING'
}

export interface ActionInstance {
  actionId: string;
  citizenId: string;
  actionType: ActionType;
  state: ActionState;
  startedAt: SimulationTime;
  completedAt?: SimulationTime;
  target?: { type: string; id: string };
  source: string;
  reason: string;
  failureReason?: string;
  routeId?: string;
  metadata?: Record<string, any>;
}
