import { ActionInstance, Citizen, SimulationTime } from '@genesis/shared';
import { ActionLifecycleManager } from './ActionLifecycleManager';

export interface ActionExecutorContext {
  citizen: Citizen;
  action: ActionInstance;
  currentTime: SimulationTime;
}

export abstract class BaseActionExecutor {
  constructor(protected lifecycleManager: ActionLifecycleManager) {}

  /**
   * Returns true if this executor can handle the given action type.
   */
  public abstract canHandle(actionType: string): boolean;
  
  /**
   * Called once when the action transitions to STARTED.
   */
  public abstract start(context: ActionExecutorContext): void;
  
  /**
   * Called on every simulation tick while the action is IN_PROGRESS.
   */
  public abstract tick(context: ActionExecutorContext): void;
}
