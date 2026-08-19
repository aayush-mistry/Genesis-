import { CandidateAction, DecisionContext, ActionType } from '@genesis/shared';
import { UtilityWeights } from '../UtilityWeights';

export class SafetyUtilityEvaluator {
  public evaluate(action: CandidateAction, context: DecisionContext): number {
    if (action.type === ActionType.SEEK_MEDICAL_HELP) {
      if (context.vitalState.health < 30) {
        return UtilityWeights.CRITICAL_HEALTH_BONUS;
      }
    }
    return UtilityWeights.NEUTRAL_CONTRIBUTION;
  }
}
