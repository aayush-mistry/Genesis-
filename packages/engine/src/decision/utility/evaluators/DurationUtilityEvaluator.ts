import { CandidateAction, DecisionContext, ActionType } from '@genesis/shared';
import { UtilityWeights } from '../UtilityWeights';
import { TimeUtils } from '../../../utils/TimeUtils';

export class DurationUtilityEvaluator {
  public evaluate(action: CandidateAction, context: DecisionContext): number {
    const schedule = context.currentRoutineActivity;
    
    if (!schedule) return 0;
    
    // If the citizen is scheduled to work or study soon, penalize long actions.
    const isWorkingTime = schedule.type === 'WORK' || schedule.type === 'STUDY';
    
    if (isWorkingTime) {
      if (action.type !== ActionType.WORK && action.type !== ActionType.STUDY && action.type !== ActionType.GO_TO_WORK && action.type !== ActionType.GO_TO_SCHOOL) {
         // Penalize non-work activities during work time
         // Especially if they are long
         return -30;
      }
    }
    
    return 0;
  }
}
