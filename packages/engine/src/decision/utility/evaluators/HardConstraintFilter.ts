import { CandidateAction, DecisionContext, ActionType } from '@genesis/shared';

export class HardConstraintFilter {
  public isValid(action: CandidateAction, context: DecisionContext): boolean {
    // 1. Check Affordability for Purchases
    if (action.type === ActionType.PURCHASE) {
      const quantity = action.metadata?.targetQuantity || 1;
      const expectedPrice = action.metadata?.expectedPrice || 10; // Fallback estimate
      const totalExpectedCost = quantity * expectedPrice;
      
      const walletBalance = context.walletBalance || 0;
      if (walletBalance < totalExpectedCost) {
        return false; // Unaffordable
      }
    }

    // 2. Resource Availability for Consumption
    if (action.type === ActionType.CONSUME_FOOD) {
      const foodStock = context.stockLevels?.['wheat'] || 0;
      if (foodStock <= 0) {
        return false;
      }
    }

    if (action.type === ActionType.CONSUME_WATER) {
      const waterStock = context.stockLevels?.['water'] || 0;
      if (waterStock <= 0) {
        return false;
      }
    }

    // 3. Impossible destination (Action is invalid if target is unreachable or doesn't exist)
    if (action.target && action.target.type === 'BUILDING' && !action.target.id) {
        return false; // Invalid target
    }
    
    if (action.target && action.target.type === 'RESOURCE' && !action.target.id) {
        return false;
    }

    return true; // Action is possible
  }
}
