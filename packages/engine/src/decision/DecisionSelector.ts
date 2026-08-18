import { Action, ActionType, DecisionContext } from '@genesis/shared';

export interface EvaluatedAction {
  action: Action;
  score: number;
}

export class DecisionSelector {
  /**
   * Selects the highest scoring action. 
   * If there are ties, deterministic tie-breaking is applied based on the ActionType string value.
   */
  public selectBestAction(evaluatedActions: EvaluatedAction[], context: DecisionContext): EvaluatedAction {
    if (!evaluatedActions || evaluatedActions.length === 0) {
      // Fallback if somehow no candidate actions exist
      return {
        action: { type: ActionType.REST },
        score: 0
      };
    }

    return evaluatedActions.reduce((best, current) => {
      if (current.score > best.score) {
        return current;
      } else if (current.score === best.score) {
        // Deterministic tie-breaker: compare ActionType alphabetically
        // We could use an explicit priority map in the future if needed
        return current.action.type.localeCompare(best.action.type) < 0 ? current : best;
      }
      return best;
    }, evaluatedActions[0]);
  }
}
