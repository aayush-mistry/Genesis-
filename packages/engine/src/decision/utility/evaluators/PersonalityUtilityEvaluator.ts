import { CandidateAction, DecisionContext, ActionType } from '@genesis/shared';
import { UtilityWeights } from '../UtilityWeights';

export class PersonalityUtilityEvaluator {
  public evaluate(action: CandidateAction, context: DecisionContext): number {
    const personality = context.personality;
    if (!personality) return 0;

    let score = 0;

    // Price sensitivity and quality preference for purchases
    if (action.type === ActionType.PURCHASE) {
      const expectedPrice = action.metadata?.expectedPrice || 10;
      
      // If citizen is very price sensitive, they prefer cheaper things (for same type of good, assuming a normalized scale)
      // Since this evaluator is per-action, we can penalize expensive things based on price sensitivity.
      // High price sensitivity -> High penalty for high price
      // For now, just apply a basic modifier based on priceSensitivity to differentiate choices
      const priceFactor = (personality.priceSensitivity / 100);
      
      // Example: high price means lower utility, scaled by price sensitivity
      // A price of 10 might have less penalty for someone with low price sensitivity.
      score -= expectedPrice * priceFactor;

      // Quality preference (if action has a quality metadata)
      const quality = action.metadata?.quality || 1;
      score += quality * (personality.qualityPreference / 100) * 10; 
    }

    // Convenience preference for travel
    const requiresTravel = [
      ActionType.GO_TO_WORK, 
      ActionType.GO_TO_SCHOOL,
      ActionType.GO_TO_FOOD_SOURCE,
      ActionType.GO_TO_WATER_SOURCE
    ].includes(action.type);

    if (requiresTravel) {
      // High convenience preference -> penalize travel
      const convenienceFactor = personality.conveniencePreference / 100;
      score -= 20 * convenienceFactor; 
    }

    // Return the calculated score
    return Math.max(-50, Math.min(50, score)); // Clamp to reasonable bounds
  }
}
