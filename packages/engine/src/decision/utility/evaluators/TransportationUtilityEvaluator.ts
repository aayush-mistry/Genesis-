import { CandidateAction, DecisionContext, ActionType } from '@genesis/shared';
import { UtilityWeights } from '../UtilityWeights';

export class TransportationUtilityEvaluator {
  public evaluate(action: CandidateAction, context: DecisionContext): number {
    if (!action.target || !action.target.id) return 0;
    
    const requiresTravel = [
      ActionType.GO_TO_WORK, 
      ActionType.GO_TO_SCHOOL,
      ActionType.GO_TO_FOOD_SOURCE,
      ActionType.GO_TO_WATER_SOURCE,
      ActionType.PURCHASE
    ].includes(action.type);

    if (!requiresTravel) return 0;

    // We can estimate distance based on perception
    const perception = context.perception;
    let distance = 0;

    if (action.target.type === 'BUILDING') {
      const building = perception?.nearbyBuildings.find(b => b.id === action.target!.id);
      if (building) distance = building.distance;
    } else if (action.target.type === 'RESOURCE') {
      const resource = perception?.nearbyResources.find(r => r.id === action.target!.id);
      if (resource) distance = resource.distance;
    }
    
    // Penalize long distance travel. 
    // Example: Distance of 1000m -> -10 score
    if (distance > 0) {
      let penalty = (distance / 100) * UtilityWeights.DISTANCE_PENALTY_PER_UNIT;
      return Math.max(UtilityWeights.MAX_DISTANCE_PENALTY, penalty);
    }

    return 0;
  }
}
