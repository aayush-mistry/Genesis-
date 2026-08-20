import { ActionState, ActionType, SimulationTime } from '@genesis/shared';
import { BaseActionExecutor, ActionExecutorContext } from './BaseActionExecutor';
import { ActionLifecycleManager } from './ActionLifecycleManager';
import { TimeUtils } from '../utils/TimeUtils';

export class RoutineActionExecutor extends BaseActionExecutor {
  constructor(
    lifecycleManager: ActionLifecycleManager
  ) {
    super(lifecycleManager);
  }

  public canHandle(actionType: string): boolean {
    return [
      ActionType.WORK,
      ActionType.STUDY,
      ActionType.IDLE
    ].includes(actionType as ActionType);
  }

  public start(context: ActionExecutorContext): void {
    const { action } = context;
    
    // For routine actions, they take some duration.
    let durationMinutes = 60;
    if (action.actionType === ActionType.WORK) durationMinutes = 8 * 60;
    if (action.actionType === ActionType.STUDY) durationMinutes = 6 * 60;
    if (action.actionType === ActionType.IDLE) durationMinutes = 15;
    
    const durationSeconds = durationMinutes * 60;
    const expectedCompletionTime = TimeUtils.fromSeconds(TimeUtils.toSeconds(context.currentTime) + durationSeconds);
    action.metadata = { ...action.metadata, expectedCompletionTime };
    
    this.lifecycleManager.transition(action, ActionState.IN_PROGRESS);
  }

  public tick(context: ActionExecutorContext): void {
    const { action, currentTime } = context;
    
    if (action.state !== ActionState.IN_PROGRESS) return;

    const expectedCompletionTime = action.metadata?.expectedCompletionTime as SimulationTime;
    
    if (expectedCompletionTime && TimeUtils.compare(currentTime, expectedCompletionTime) >= 0) {
      this.lifecycleManager.transition(action, ActionState.COMPLETED);
    }
  }
}
