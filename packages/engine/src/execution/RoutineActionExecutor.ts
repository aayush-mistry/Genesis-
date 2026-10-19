import { ActionState, ActionType, EmploymentStatus, SimulationTime } from '@genesis/shared';
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
    const { action, currentTime, citizen } = context;
    
    if (action.state !== ActionState.IN_PROGRESS) return;

    const expectedCompletionTime = action.metadata?.expectedCompletionTime as SimulationTime;
    
    if (expectedCompletionTime && TimeUtils.compare(currentTime, expectedCompletionTime) >= 0) {
      const transitioned = this.lifecycleManager.transition(action, ActionState.COMPLETED);
      if (
        transitioned &&
        action.actionType === ActionType.WORK &&
        citizen &&
        citizen.employmentStatus === EmploymentStatus.EMPLOYED
      ) {
        if (!citizen.employmentRecord) {
          citizen.employmentRecord = {
            daysWorked: 0,
            expectedWorkingDays: 30,
            performanceScore: 1.0,
            startDate: { ...currentTime },
            endDate: null,
            lastPaymentDate: null,
            unpaidWages: 0,
            lastWorkDate: null
          };
        }
        const rec = citizen.employmentRecord;
        const last = rec.lastWorkDate;
        const alreadyWorkedToday = !!(
          last &&
          last.year === currentTime.year &&
          last.month === currentTime.month &&
          last.day === currentTime.day
        );

        if (!alreadyWorkedToday) {
          rec.daysWorked = Math.min(rec.expectedWorkingDays || 30, (rec.daysWorked || 0) + 1);
          rec.lastWorkDate = { year: currentTime.year, month: currentTime.month, day: currentTime.day };
        }
      }
    }
  }
}

