import { CandidateAction, DecisionContext } from '@genesis/shared';
import { UtilityWeights } from '../UtilityWeights';

export class TravelUtilityEvaluator {
  public evaluate(action: CandidateAction, context: DecisionContext): number {
    if (!action.target) return UtilityWeights.NEUTRAL_CONTRIBUTION;

    // Find target in perception
    const perception = context.perception;
    let distance = 0;
    let found = false;

    if (action.target.type === 'RESOURCE') {
      const resource = perception.nearbyResources.find(r => r.id === action.target?.id);
      if (resource) {
        distance = resource.distance;
        found = true;
      }
    } else if (action.target.type === 'BUILDING') {
      const building = perception.nearbyBuildings.find(b => b.id === action.target?.id);
      if (building) {
        distance = building.distance;
        found = true;
      }
    }

    if (!found) return UtilityWeights.NEUTRAL_CONTRIBUTION; // If we can't find it, we can't penalize it safely

    // A real transportation engine would evaluate modes of transport.
    // We stub this with a simple distance penalty.
    let penalty = distance * UtilityWeights.DISTANCE_PENALTY_PER_UNIT;
    
    // Clamp penalty
    if (penalty < UtilityWeights.MAX_DISTANCE_PENALTY) {
      penalty = UtilityWeights.MAX_DISTANCE_PENALTY;
    }

    return penalty; // Negative value
  }
}
