import { CandidateAction, DecisionContext, ActionType } from '@genesis/shared';
import { UtilityWeights } from '../UtilityWeights';

export class EnergyUtilityEvaluator {
  public evaluate(action: CandidateAction, context: DecisionContext): number {
    const energyLevel = context.vitalState.energy;
    
    // Evaluate based on ActionType
    switch (action.type) {
      case ActionType.REST:
        // If energy is low, resting is highly rewarded
        if (energyLevel < 20) return 80;
        if (energyLevel < 40) return 50;
        if (energyLevel < 60) return 20;
        if (energyLevel > 80) return -20; // Penalize rest if full energy
        return 0;

      case ActionType.WORK:
      case ActionType.STUDY:
      case ActionType.SEEK_FOOD:
      case ActionType.SEEK_WATER:
      case ActionType.SEEK_MEDICAL_HELP:
      case ActionType.GO_TO_WORK:
      case ActionType.GO_TO_SCHOOL:
      case ActionType.GO_TO_FOOD_SOURCE:
      case ActionType.GO_TO_WATER_SOURCE:
        // Strenuous activities
        if (energyLevel < 15) return -80;
        if (energyLevel < 30) return -40;
        return 0;

      case ActionType.PURCHASE:
      case ActionType.CONSUME_FOOD:
      case ActionType.CONSUME_WATER:
        // Light activities
        if (energyLevel < 10) return -20;
        return 0;
        
      case ActionType.IDLE:
        // Idle is a fallback
        if (energyLevel < 30) return 10;
        return 0;

      default:
        return 0;
    }
  }
}
