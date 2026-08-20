import { ActionState, ActionType, SimulationTime } from '@genesis/shared';
import { BaseActionExecutor, ActionExecutorContext } from './BaseActionExecutor';
import { ActionLifecycleManager } from './ActionLifecycleManager';
import { NeedsService } from '../citizen/services/NeedsService';
import { TimeUtils } from '../utils/TimeUtils';

export class NeedActionExecutor extends BaseActionExecutor {
  constructor(
    lifecycleManager: ActionLifecycleManager,
    private needsService: NeedsService
  ) {
    super(lifecycleManager);
  }

  public canHandle(actionType: string): boolean {
    return [
      ActionType.EAT,
      ActionType.DRINK,
      ActionType.REST,
      ActionType.SEEK_MEDICAL_HELP
    ].includes(actionType as ActionType);
  }

  public start(context: ActionExecutorContext): void {
    const { action } = context;
    
    // Set an expected completion time based on action type.
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
      // Action is done, apply the effect
      this.applyEffect(citizen, action.actionType);
      this.lifecycleManager.transition(action, ActionState.COMPLETED);
    }
  }

  private getDurationForAction(actionType: ActionType): number {
    switch (actionType) {
      case ActionType.EAT: return 30; // 30 minutes
      case ActionType.DRINK: return 10;
      case ActionType.REST: return 8 * 60; // 8 hours
      case ActionType.SEEK_MEDICAL_HELP: return 60;
      default: return 15;
    }
  }

  private applyEffect(citizen: import('@genesis/shared').Citizen, actionType: ActionType): void {
    switch (actionType) {
      case ActionType.EAT:
        this.needsService.satisfyHunger(citizen, 50);
        break;
      case ActionType.DRINK:
        this.needsService.satisfyThirst(citizen, 50);
        break;
      case ActionType.REST:
        this.needsService.recoverEnergy(citizen, 100);
        break;
      case ActionType.SEEK_MEDICAL_HELP:
        this.needsService.restoreHealth(citizen, 50);
        break;
    }
  }
}
