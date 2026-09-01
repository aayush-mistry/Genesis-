import { ActionInstance, ActionState, ActionType, SimulationTime } from '@genesis/shared';
import { BaseActionExecutor, ActionExecutorContext } from './BaseActionExecutor';
import { ActionLifecycleManager } from './ActionLifecycleManager';
import { ConsumptionEngine, ConsumableNeedType } from '../consumption/ConsumptionEngine';
import { TimeUtils } from '../utils/TimeUtils';

export class ResourceInteractionExecutor extends BaseActionExecutor {
  constructor(
    lifecycleManager: ActionLifecycleManager,
    private consumptionEngine: ConsumptionEngine
  ) {
    super(lifecycleManager);
  }

  public canHandle(actionType: string): boolean {
    return [
      ActionType.CONSUME_FOOD,
      ActionType.CONSUME_WATER,
      ActionType.SEEK_MEDICAL_HELP
    ].includes(actionType as ActionType);
  }

  public start(context: ActionExecutorContext): void {
    const { action } = context;
    
    const durationMinutes = this.getDurationForAction(action.actionType);
    const durationSeconds = durationMinutes * 60;
    
    const expectedCompletionTime = TimeUtils.fromSeconds(TimeUtils.toSeconds(context.currentTime) + durationSeconds);
    action.metadata = { ...action.metadata, expectedCompletionTime };
    
    this.lifecycleManager.transition(action, ActionState.IN_PROGRESS);
  }

  public tick(context: ActionExecutorContext): void {
    const { action, citizen, currentTime } = context;
    
    if (action.state !== ActionState.IN_PROGRESS) return;

    const expectedCompletionTime = action.metadata?.expectedCompletionTime as SimulationTime;
    
    if (expectedCompletionTime && TimeUtils.compare(currentTime, expectedCompletionTime) >= 0) {
      const currentSeconds = TimeUtils.toSeconds(currentTime);
      const needType = this.getNeedTypeForAction(action.actionType);
      
      const success = this.consumptionEngine.consume(citizen, needType, currentSeconds);
      
      if (success) {
        this.lifecycleManager.transition(action, ActionState.COMPLETED);
      } else {
        this.lifecycleManager.transition(action, ActionState.FAILED);
      }
    }
  }

  private getDurationForAction(actionType: ActionType): number {
    switch (actionType) {
      case ActionType.CONSUME_FOOD: return 30; // 30 minutes
      case ActionType.CONSUME_WATER: return 10;
      case ActionType.SEEK_MEDICAL_HELP: return 60;
      default: return 15;
    }
  }

  private getNeedTypeForAction(actionType: ActionType): ConsumableNeedType {
    switch (actionType) {
      case ActionType.CONSUME_FOOD: return 'HUNGER';
      case ActionType.CONSUME_WATER: return 'THIRST';
      case ActionType.SEEK_MEDICAL_HELP: return 'HEALTH';
      default: return 'HUNGER';
    }
  }
}
