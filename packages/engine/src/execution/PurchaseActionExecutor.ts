import { ActionType, ActionState, TransactionType } from '@genesis/shared';
import { BaseActionExecutor, ActionExecutorContext } from './BaseActionExecutor';
import { ActionLifecycleManager } from './ActionLifecycleManager';
import { MarketEngine } from '../market/MarketEngine';
import { MovementService } from '../citizen/services/MovementService';

export class PurchaseActionExecutor extends BaseActionExecutor {
  constructor(
    lifecycleManager: ActionLifecycleManager,
    private marketEngine: MarketEngine,
    private movementService: MovementService
  ) {
    super(lifecycleManager);
  }

  public canHandle(actionType: string): boolean {
    return actionType === ActionType.PURCHASE;
  }

  public start(context: ActionExecutorContext): void {
    const { citizen, action } = context;

    if (!action.target || !action.target.id) {
      this.lifecycleManager.transition(action, ActionState.FAILED, 'No valid target to purchase from');
      return;
    }

    if (citizen.locationId !== action.target.id) {
      // Need to travel to the target first
      const route = this.movementService.requestMovement(citizen.id, action.target.id);
      if (!route) {
        this.lifecycleManager.transition(action, ActionState.FAILED, 'Cannot path to purchase target');
        return;
      }
      this.lifecycleManager.transition(action, ActionState.IN_PROGRESS, 'Travelling to store');
    } else {
      // Already there, we can process immediately
      this.lifecycleManager.transition(action, ActionState.IN_PROGRESS, 'At store');
      this.tick(context); // Force first tick evaluation immediately
    }
  }

  public tick(context: ActionExecutorContext): void {
    const { citizen, action } = context;

    // Check if we arrived at the target location
    if (citizen.locationId !== action.target?.id) {
      return; // Still travelling
    }

    // We are at the store, execute purchase
    const sellerId = action.target.id;
    const productId = action.metadata?.productId || 'wheat'; // default
    
    // Check if store is in a region to get regional pricing
    const regionId = 'TODO'; // Could be extracted from store metadata, assuming default for now
    
    // Get expected price and quantity
    const quantity = action.metadata?.quantity || 1;
    // For now we assume we know a base price, realistically this would be fetched from store or market
    const basePrice = 10;
    const finalPrice = this.marketEngine.calculateEffectivePrice(productId, regionId, basePrice) * quantity;

    if (citizen.wallet.balance < finalPrice) {
      this.lifecycleManager.transition(action, ActionState.FAILED, 'Insufficient funds');
      return;
    }

    const transaction = this.marketEngine.processTransaction(
      citizen.id,
      sellerId,
      productId,
      quantity,
      'kg',
      finalPrice / quantity, // unit price
      finalPrice,
      citizen.wallet.currency,
      TransactionType.PURCHASE,
      regionId
    );

    if (transaction) {
      this.lifecycleManager.transition(action, ActionState.COMPLETED, 'Purchase successful');
    } else {
      this.lifecycleManager.transition(action, ActionState.FAILED, 'Purchase failed (no stock or other issue)');
    }
  }
}
