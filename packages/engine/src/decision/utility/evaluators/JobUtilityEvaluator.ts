import { CandidateAction, DecisionContext, ActionType } from '@genesis/shared';
import { UtilityWeights } from '../UtilityWeights';

export class JobUtilityEvaluator {
  public evaluate(action: CandidateAction, context: DecisionContext): number {
    const routineType = context.currentRoutineActivity?.type || context.perception?.schedule?.currentActivity;
    
    // If it's time to work, reward work actions, heavily penalize everything else.
    if (routineType === 'WORK') {
      if (action.type === ActionType.WORK || action.type === ActionType.GO_TO_WORK) {
        return 50;
      } else {
        // Need to penalize other actions, unless they are critical (handled by need urgency)
        return -40;
      }
    }
    
    if (routineType === 'STUDY') {
      if (action.type === ActionType.STUDY || action.type === ActionType.GO_TO_SCHOOL) {
        return 50;
      } else {
        return -40;
      }
    }
    
    return 0;
  }
}
