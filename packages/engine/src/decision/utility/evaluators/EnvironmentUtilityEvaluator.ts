import { CandidateAction, DecisionContext, ActionType } from '@genesis/shared';
import { UtilityWeights } from '../UtilityWeights';

export class EnvironmentUtilityEvaluator {
  public evaluate(action: CandidateAction, context: DecisionContext): number {
    const environment = context.perception?.environment;
    if (!environment) return 0;
    
    // Penalize outdoor activities if weather is bad
    const isOutdoor = [
      ActionType.SEEK_FOOD,
      ActionType.SEEK_WATER,
      ActionType.GO_TO_WORK,
      ActionType.GO_TO_SCHOOL,
      ActionType.GO_TO_FOOD_SOURCE,
      ActionType.GO_TO_WATER_SOURCE
    ].includes(action.type);

    if (isOutdoor) {
      if (environment.weather === 'Storm' || environment.weather === 'Heavy Snow' || environment.weather === 'Light Snow') {
        return -20;
      }
      if (environment.weather === 'Rain' || environment.weather === 'Light Rain') {
        return -10;
      }
    }

    return 0;
  }
}
