import { CandidateAction, DecisionContext } from '@genesis/shared';
import { UtilityWeights } from '../UtilityWeights';

export class StubEvaluators {
  public evaluateEnergy(action: CandidateAction, context: DecisionContext): number {
    return UtilityWeights.NEUTRAL_CONTRIBUTION;
  }
  public evaluateDuration(action: CandidateAction, context: DecisionContext): number {
    return UtilityWeights.NEUTRAL_CONTRIBUTION;
  }
  public evaluateEnvironment(action: CandidateAction, context: DecisionContext): number {
    return UtilityWeights.NEUTRAL_CONTRIBUTION;
  }
  public evaluateJob(action: CandidateAction, context: DecisionContext): number {
    return UtilityWeights.NEUTRAL_CONTRIBUTION;
  }
  public evaluatePersonality(action: CandidateAction, context: DecisionContext): number {
    return UtilityWeights.NEUTRAL_CONTRIBUTION;
  }
  public evaluateTransportation(action: CandidateAction, context: DecisionContext): number {
    return UtilityWeights.NEUTRAL_CONTRIBUTION;
  }
}
