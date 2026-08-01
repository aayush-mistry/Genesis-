import { SimulationTime } from '../time/SimulationTime';

export type EventStatus = 'Scheduled' | 'Waiting' | 'Executing' | 'Completed' | 'Cancelled' | 'Failed' | 'Expired' | 'Paused';
export type EventPriority = 'Low' | 'Normal' | 'High' | 'Critical';

export type EventHandler = (event: SimulationEvent) => void | Promise<void>;

export interface EventRecurrence {
  interval: 'Hour' | 'Day' | 'Week' | 'Month' | 'Year';
  count?: number; // How many times it should recur (undefined for infinite)
}

export interface SimulationEvent {
  id: string;
  name: string;
  description: string;
  scheduledTime: SimulationTime;
  priority: EventPriority;
  status: EventStatus;
  
  createdTime: SimulationTime;
  executionTime?: SimulationTime; // When it actually executed
  completionTime?: SimulationTime; // When execution completed
  
  handler: EventHandler;
  
  metadata?: Record<string, unknown>;
  tags?: string[];
  
  sourceModule: string;
  targetModule: string;
  
  recurrence?: EventRecurrence;
  recurrenceCount?: number; // Tracks how many times it has recurred so far
  
  cancelFlag: boolean;
  retryCount: number;
  executionResult?: unknown;

  // Lifecycle & Metrics
  stateTransitions?: { state: EventStatus; time: SimulationTime }[];
  executionDurationMs?: number;
  metrics?: {
    schedulingTimeMs?: number;
    queuePosition?: number;
  };
}
