import { Action, DecisionContext, ActionType } from '@genesis/shared';
import { ScoreUtils } from './scoring/ScoreUtils';

/**
 * Base interface for an evaluator that scores a specific aspect of an action.
 */
export interface IDecisionEvaluator {
  evaluate(context: DecisionContext, action: Action): number;
}

/**
 * The main evaluator orchestrates scoring. 
 * In a fully expanded system, it would delegate to NeedsEvaluator, WorkEvaluator, etc.
 * For Phase 4.1, we implement the framework and basic logic for testing.
 */
export class DecisionEvaluator implements IDecisionEvaluator {
  public evaluate(context: DecisionContext, action: Action): number {
    let score = 0;

    switch (action.type) {
      case ActionType.CONSUME_FOOD:
      case ActionType.SEEK_FOOD:
        // CONSUME_FOOD urgency is driven by hunger (0 = full, 100 = starving)
        score = ScoreUtils.normalizeToScore(context.vitalState.hunger, 0, 100);
        break;

      case ActionType.CONSUME_WATER:
      case ActionType.SEEK_WATER:
        // CONSUME_WATER urgency is driven by thirst
        score = ScoreUtils.normalizeToScore(context.vitalState.thirst, 0, 100);
        break;

      case ActionType.REST:
        // REST is a fallback if energy is low or there is nothing better to do.
        // A tired citizen (energy = 0) has a high REST score.
        score = ScoreUtils.normalizeToScore(100 - context.vitalState.energy, 0, 100);
        
        // Base fallback score to ensure REST is always an option if nothing else scores higher
        score = Math.max(score, 20); 
        break;

      case ActionType.GO_TO_WORK:
      case ActionType.WORK:
        // Work is urgent if it's currently scheduled.
        // In this basic framework, if a citizen is employed, we might pass a "workUrgency" via context or calculate based on schedule.
        // For testing integration, we'll read a mock "workUrgency" from the context if it exists, otherwise provide a moderate score if employed.
        if (context.workUrgency !== undefined) {
           score = ScoreUtils.clampScore(context.workUrgency);
        } else if (context.employmentStatus === 'EMPLOYED' && context.workplaceId) {
           // Standard urgency for an employed citizen during work hours (can be extended)
           score = 60;
        } else {
           score = 0;
        }
        break;
        
      case ActionType.SEEK_MEDICAL_HELP:
        // Medical urgency is driven by low health
        score = ScoreUtils.normalizeToScore(100 - context.vitalState.health, 0, 100);
        break;

      default:
        score = 0;
    }

    return ScoreUtils.clampScore(score);
  }
}
