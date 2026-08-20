import { ActionInstance, Citizen, SimulationTime } from '@genesis/shared';
import { BaseActionExecutor, ActionExecutorContext } from './BaseActionExecutor';
import { ActionLifecycleManager } from './ActionLifecycleManager';

export class ResourceInteractionExecutor extends BaseActionExecutor {
  constructor(
    lifecycleManager: ActionLifecycleManager
  ) {
    super(lifecycleManager);
  }

  public canHandle(actionType: string): boolean {
    // Currently handled by NeedActionExecutor directly for phase 4.5
    return false;
  }

  public start(context: ActionExecutorContext): void {
    // Stub for future resource consumption (e.g. picking up an item)
  }

  public tick(context: ActionExecutorContext): void {
    // Stub
  }
}
