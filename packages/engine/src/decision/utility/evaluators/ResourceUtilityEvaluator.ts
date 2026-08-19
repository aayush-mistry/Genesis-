import { CandidateAction, DecisionContext, ActionType } from '@genesis/shared';
import { UtilityWeights } from '../UtilityWeights';

export class ResourceUtilityEvaluator {
  public evaluate(action: CandidateAction, context: DecisionContext): number {
    if (action.type === ActionType.GO_TO_FOOD_SOURCE || action.type === ActionType.GO_TO_WATER_SOURCE) {
      if (action.target && action.target.type === 'RESOURCE') {
        const resource = context.perception.nearbyResources.find(r => r.id === action.target?.id);
        if (resource) {
          // E.g. richer resource = small positive modifier
          return Math.min(20, resource.quantity); 
        }
      }
    }
    return UtilityWeights.NEUTRAL_CONTRIBUTION;
  }
}
