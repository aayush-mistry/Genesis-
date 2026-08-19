import { VitalState } from './citizen';
import { Skill, EmploymentStatus } from './occupation';

export enum ActionType {
  EAT = 'EAT',
  DRINK = 'DRINK',
  REST = 'REST',
  GO_TO_WORK = 'GO_TO_WORK',
  WORK = 'WORK',
  GO_HOME = 'GO_HOME',
  GO_TO_SCHOOL = 'GO_TO_SCHOOL',
  STUDY = 'STUDY',
  SEEK_FOOD = 'SEEK_FOOD',
  SEEK_WATER = 'SEEK_WATER',
  SEEK_MEDICAL_HELP = 'SEEK_MEDICAL_HELP',
  GO_TO_FOOD_SOURCE = 'GO_TO_FOOD_SOURCE',
  GO_TO_WATER_SOURCE = 'GO_TO_WATER_SOURCE',
  IDLE = 'IDLE',
}

export enum NeedUrgencyLevel {
  VERY_LOW = 'VERY_LOW',
  LOW = 'LOW',
  MODERATE = 'MODERATE',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL'
}

export interface NeedState {
  needType: string;
  rawValue: number;
  level: NeedUrgencyLevel;
  urgency: number;
}

export interface CandidateAction extends Action {
  source: string;
  reason: string;
  target?: { type: string; id: string };
}

export interface CandidateActionSet {
  citizenId: string;
  timestamp: Date;
  triggeredNeeds: NeedState[];
  candidates: CandidateAction[];
  metadata?: Record<string, any>;
}

export enum ActionResult {
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  BLOCKED = 'BLOCKED',
  CANCELLED = 'CANCELLED',
  DEFERRED = 'DEFERRED',
}

export enum DecisionTriggerType {
  NEED_THRESHOLD_CROSSED = 'NEED_THRESHOLD_CROSSED',
  SCHEDULE_START = 'SCHEDULE_START',
  SCHEDULE_END = 'SCHEDULE_END',
  MOVEMENT_COMPLETED = 'MOVEMENT_COMPLETED',
  PERIODIC_FALLBACK = 'PERIODIC_FALLBACK',
  EVENT_DRIVEN = 'EVENT_DRIVEN',
}

export interface Action {
  type: ActionType;
  metadata?: Record<string, any>;
}

export interface DecisionContext {
  citizenId: string;
  age: number;
  vitalState: VitalState;
  skills: Skill[];
  employmentStatus: EmploymentStatus;
  workplaceId: string | null;
  currentLocationId: string;
  currentDestinationId: string | null;
  simulationTime: Date;
  perception: import('./perception').PerceptionSnapshot;
  // Extensible for future attributes like weather, wealth, traits, etc.
  [key: string]: any;
}

export interface UtilityBreakdown {
  needUrgency: number;
  schedule: number;
  safety: number;
  resourceAvailability: number;
  travel: number;
  transportation: number;
  energy: number;
  duration: number;
  environment: number;
  job: number;
  personality: number;
  total: number;
}

export interface RankedAction {
  action: CandidateAction;
  rank: number;
  score: number;
  breakdown: UtilityBreakdown;
}

export interface DecisionResult {
  citizenId: string;
  timestamp: Date;
  selectedAction: CandidateAction;
  rankedActions: RankedAction[];
  reasoning?: Record<string, any>;
}

// Deprecated in favor of DecisionResult for Phase 4.4+
export interface Decision {
  action: Action;
  score: number;
  citizenId: string;
  reasoning: Record<string, any>;
  timestamp: Date;
}

export interface DecisionRecord {
  citizenId: string;
  timestamp: Date;
  candidateActions: ActionType[];
  scores: Record<ActionType, number>;
  selectedAction: ActionType;
  trigger: DecisionTriggerType;
  result?: ActionResult;
}
