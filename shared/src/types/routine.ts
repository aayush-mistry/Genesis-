export enum RoutineType {
  ADULT_WORKER = 'ADULT_WORKER',
  STUDENT = 'STUDENT',
  UNEMPLOYED_ADULT = 'UNEMPLOYED_ADULT',
  ELDERLY = 'ELDERLY',
  CHILD = 'CHILD'
}

export enum RoutineActivityType {
  SLEEP = 'SLEEP',
  WORK = 'WORK',
  STUDY = 'STUDY',
  MEAL = 'MEAL',
  EXERCISE = 'EXERCISE',
  REST = 'REST',
  FREE_TIME = 'FREE_TIME',
  TRAVEL = 'TRAVEL'
}

export interface RoutineActivity {
  id: string;
  type: RoutineActivityType;
  /** Start time in simulation hours (0.0 to 23.99) */
  startTime: number;
  /** End time in simulation hours (0.0 to 23.99) */
  endTime: number;
  destinationType?: 'HOME' | 'WORKPLACE' | 'SCHOOL' | 'FOOD_SOURCE' | 'RECREATION';
  interruptible: boolean;
}

export interface CitizenRoutine {
  citizenId: string;
  scheduleType: RoutineType;
  activities: RoutineActivity[];
}
