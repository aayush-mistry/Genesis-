import { ActionInstance, Citizen, ActionState } from '@genesis/shared';
import { EventScheduler } from '../events/EventScheduler';
import { TimeEngine } from '../time/TimeEngine';

export class FailureRecoveryManager {
  constructor(
    private eventScheduler: EventScheduler,
    private timeEngine: TimeEngine
  ) {}

  public handleFailure(citizen: Citizen, action: ActionInstance): void {
    if (action.state !== ActionState.FAILED) return;

    // Log the failure
    console.log(`[FailureRecovery] Citizen ${citizen.id} failed action ${action.actionType}. Reason: ${action.failureReason}`);

    // Track attempt count in metadata
    const attemptCount = (action.metadata?.attemptCount || 0) + 1;
    
    if (attemptCount >= 3) {
      console.log(`[FailureRecovery] Citizen ${citizen.id} exhausted retries for action ${action.actionType}. Entering safe recovery.`);
      // Enter a safe recovery/waiting state - next tick will handle naturally via IDLE
      return;
    }

    // Emit a 'DecisionRequested' event to trigger 4.3 -> 4.4 -> 4.5 pipeline
    this.eventScheduler.emitter.emit('DecisionRequested', {
      citizenId: citizen.id,
      trigger: 'ACTION_FAILED',
      failedAction: action,
      time: this.timeEngine.getCurrentTime()
    });
  }
}
