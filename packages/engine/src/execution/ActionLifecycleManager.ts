import { ActionInstance, ActionState, SimulationTime } from '@genesis/shared';
import { EventScheduler } from '../events/EventScheduler';
import { TimeEngine } from '../time/TimeEngine';

export class ActionLifecycleManager {
  constructor(
    private eventScheduler: EventScheduler,
    private timeEngine: TimeEngine
  ) {}

  public transition(action: ActionInstance, newState: ActionState, reason?: string): boolean {
    if (!this.isValidTransition(action.state, newState)) {
      console.warn(`[ActionLifecycle] Invalid transition from ${action.state} to ${newState} for action ${action.actionId}`);
      return false;
    }

    const currentTime = this.timeEngine.getCurrentTime();
    const oldState = action.state;
    
    action.state = newState;
    
    if (newState === ActionState.COMPLETED || newState === ActionState.FAILED || newState === ActionState.CANCELLED) {
      action.completedAt = currentTime;
    }
    
    if (newState === ActionState.FAILED && reason) {
      action.failureReason = reason;
    }

    this.emitTransitionEvent(action, oldState, newState, currentTime);
    return true;
  }

  private isValidTransition(currentState: ActionState, newState: ActionState): boolean {
    const validNextStates: Record<string, string[]> = {
      [ActionState.PENDING]: [ActionState.STARTED, ActionState.CANCELLED, ActionState.FAILED],
      [ActionState.STARTED]: [ActionState.IN_PROGRESS, ActionState.TRAVELING, ActionState.SHOPPING, ActionState.FAILED, ActionState.CANCELLED],
      [ActionState.TRAVELING]: [ActionState.SHOPPING, ActionState.FAILED, ActionState.CANCELLED],
      [ActionState.SHOPPING]: [ActionState.PURCHASING, ActionState.FAILED, ActionState.CANCELLED],
      [ActionState.PURCHASING]: [ActionState.COMPLETED, ActionState.FAILED, ActionState.CANCELLED],
      [ActionState.IN_PROGRESS]: [ActionState.COMPLETED, ActionState.FAILED, ActionState.CANCELLED, ActionState.PURCHASING]
    };
    
    if (validNextStates[currentState]) {
      return validNextStates[currentState].includes(newState as string);
    }
    
    return false;
  }

  private emitTransitionEvent(action: ActionInstance, oldState: ActionState, newState: ActionState, time: SimulationTime): void {
    // Notify through the EventScheduler's emitter
    this.eventScheduler.emitter.emit('ActionStateChanged', { action, oldState, newState, time });
    
    const eventContext = {
      citizenId: action.citizenId,
      actionId: action.actionId,
      actionType: action.actionType,
      timestamp: time,
      target: action.target,
      reason: action.reason,
      failureReason: action.failureReason
    };

    switch (newState) {
      case ActionState.STARTED:
        this.eventScheduler.emitter.emit('ActionStarted', eventContext);
        break;
      case ActionState.COMPLETED:
        this.eventScheduler.emitter.emit('ActionCompleted', eventContext);
        break;
      case ActionState.FAILED:
        this.eventScheduler.emitter.emit('ActionFailed', eventContext);
        break;
      case ActionState.CANCELLED:
        this.eventScheduler.emitter.emit('ActionCancelled', eventContext);
        break;
    }
  }
}
