import { ActionType, CandidateAction, DecisionContext } from '@genesis/shared';

export class EligibilityFilter {
  /**
   * Filters the raw candidates based on hard constraints (e.g. age, employment status).
   * Also deduplicates the list so Phase 4.1 doesn't evaluate the same action twice.
   */
  public filter(candidates: CandidateAction[], context: DecisionContext): CandidateAction[] {
    let filtered = candidates.filter(action => this.isEligible(action, context));
    
    // Deduplicate based on ActionType
    // If there are multiple reasons for the same ActionType, we keep the first one
    // or we could merge reasons. We'll just keep the first (highest priority usually, or arbitrary).
    const uniqueMap = new Map<ActionType, CandidateAction>();
    for (const action of filtered) {
      if (!uniqueMap.has(action.type)) {
        uniqueMap.set(action.type, action);
      }
    }
    
    return Array.from(uniqueMap.values());
  }

  private isEligible(action: CandidateAction, context: DecisionContext): boolean {
    switch (action.type) {
      case ActionType.GO_TO_WORK:
      case ActionType.WORK:
        // Must be eligible age
        if (context.age < 18 || context.age > 75) return false;
        
        // Must have a workplace
        if (!context.workplaceId) return false;
        
        // Cannot be unemployed if they want to work (unless we allow self-employed, etc)
        // We'll trust workplaceId for now.
        return true;

      case ActionType.GO_TO_SCHOOL:
      case ActionType.STUDY:
        // Assume under 18 or explicitly enrolled
        // We don't have a rigid school system yet, but we restrict it loosely here
        if (context.age >= 18) return false;
        return true;

      case ActionType.GO_TO_FOOD_SOURCE:
      case ActionType.GO_TO_WATER_SOURCE:
      case ActionType.SEEK_MEDICAL_HELP:
        // These require a valid target
        if (!action.target || !action.target.id) return false;
        return true;

      case ActionType.PURCHASE:
        // Purchase target is resolved during execution via Store Discovery and Ranking
        return true;

      default:
        // All other basic actions (EAT, DRINK, REST, SEEK_FOOD) are always technically eligible
        // (though they might fail upon execution)
        return true;
    }
  }
}
