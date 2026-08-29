import { ActionType, ActionState, TransactionType, DecisionContext } from '@genesis/shared';
import { BaseActionExecutor, ActionExecutorContext } from './BaseActionExecutor';
import { ActionLifecycleManager } from './ActionLifecycleManager';
import { MarketEngine } from '../market/MarketEngine';
import { MovementService } from '../citizen/services/MovementService';
import { StoreRanker, StoreCandidate } from '../decision/scoring/StoreRanker';
import { SpatialQueryService } from '../spatial/SpatialQueryService';

export class PurchaseActionExecutor extends BaseActionExecutor {
  constructor(
    lifecycleManager: ActionLifecycleManager,
    private marketEngine: MarketEngine,
    private movementService: MovementService,
    private storeRanker: StoreRanker,
    private spatialQueryService: SpatialQueryService
  ) {
    super(lifecycleManager);
  }

  public canHandle(actionType: string): boolean {
    return actionType === ActionType.PURCHASE;
  }

  public start(context: ActionExecutorContext): void {
    const { citizen, action } = context;

    const productId = action.metadata?.productId || 'wheat';
    const quantity = action.metadata?.targetQuantity || 1;

    if (!action.target || !action.target.id) {
      // Store Discovery
      const citizenCoords = (this.spatialQueryService as any).worldEngine.getEntityCoordinates(citizen.locationId || '');
      if (!citizenCoords) {
        this.lifecycleManager.transition(action, ActionState.FAILED, 'Invalid citizen location');
        return;
      }
      const buildings = this.spatialQueryService.findNearby(citizenCoords, 50000);
      const stores = buildings.filter((b: any) => {
        const type = b.metadata?.type || b.type;
        return type === 'STORE' || type === 'RETAIL' || type === 'WHOLESALE' || type === 'FARM';
      });

      const storeCandidates: StoreCandidate[] = stores.map((store: any) => ({
        id: store.id,
        type: (store.metadata?.type || store.type) as string,
        coordinates: store.position,
        distance: store.distance
      }));

      // Create a mock context for ranking
      const decisionContext: any = {
        citizenId: citizen.id,
        personality: citizen.personality,
        simulationTime: context.currentTime
      };

      // Store Ranking
      const rankedStores = this.storeRanker.rankStores(decisionContext, storeCandidates, productId, quantity);

      if (rankedStores.length === 0) {
        this.lifecycleManager.transition(action, ActionState.FAILED, 'No valid stores found with stock');
        return;
      }

      action.target = { type: 'BUILDING', id: rankedStores[0].id };
      action.metadata = action.metadata || {};
      action.metadata.selectedStoreId = rankedStores[0].id;
    }

    if (citizen.locationId !== action.target.id) {
      // Need to travel to the target first
      const route = this.movementService.requestMovement(citizen.id, action.target.id);
      if (!route) {
        this.lifecycleManager.transition(action, ActionState.FAILED, 'Cannot path to purchase target');
        return;
      }
      this.lifecycleManager.transition(action, ActionState.TRAVELING, 'Travelling to store');
    } else {
      // Already there, we can process immediately
      this.lifecycleManager.transition(action, ActionState.SHOPPING, 'At store');
      this.tick(context); // Force first tick evaluation immediately
    }
  }

  public tick(context: ActionExecutorContext): void {
    const { citizen, action } = context;

    if (action.state === ActionState.TRAVELING) {
      if (citizen.locationId === action.target?.id) {
        this.lifecycleManager.transition(action, ActionState.SHOPPING, 'Arrived at store');
      } else {
        return; // Still travelling
      }
    }

    if (action.state === ActionState.SHOPPING || action.state === ActionState.IN_PROGRESS) {
      this.lifecycleManager.transition(action, ActionState.PURCHASING, 'Proceeding to checkout');
    }

    if (action.state === ActionState.PURCHASING) {
      // We are at the store, execute purchase
      const sellerId = action.target!.id;
      const productId = action.metadata?.productId || 'wheat';
      
      // Check if store is in a region to get regional pricing
      const regionId = 'DEFAULT';
      
      // Get expected price and quantity
      const quantity = action.metadata?.targetQuantity || 1;
      const basePrice = 10;
      const unitPrice = this.marketEngine.calculateEffectivePrice(productId, regionId, basePrice);
      const finalPrice = unitPrice * quantity;

      if (citizen.wallet.balance < finalPrice) {
        this.lifecycleManager.transition(action, ActionState.FAILED, 'Insufficient funds');
        return;
      }

      // Check stock before transaction
      const inventory = this.storeRanker['inventoryManager'].getInventoryByOwner(sellerId);
      if (!inventory) {
        this.lifecycleManager.transition(action, ActionState.FAILED, 'Store has no inventory');
        return;
      }

      const timeSeconds = (context.currentTime as any).getTime ? (context.currentTime as any).getTime() / 1000 : 0;
      const available = this.storeRanker['inventoryManager'].getUsableQuantity(inventory.id, productId, timeSeconds);
      if (available < quantity) {
        this.lifecycleManager.transition(action, ActionState.FAILED, 'Store out of stock');
        // A smarter citizen might retry with another store here
        return;
      }

      const transaction = this.marketEngine.processTransaction(
        citizen.id,
        sellerId,
        productId,
        quantity,
        'kg',
        unitPrice,
        finalPrice,
        citizen.wallet.currency,
        TransactionType.PURCHASE,
        regionId
      );

      if (transaction) {
        // Add purchased items to household inventory (or personal)
        if (citizen.householdId) {
           const household = this.storeRanker['inventoryManager'].getInventoryByOwner(citizen.householdId);
           if (household) {
             this.storeRanker['inventoryManager'].addItemQuantity(household.id, productId, quantity, 'kg');
           }
        }
        this.lifecycleManager.transition(action, ActionState.COMPLETED, 'Purchase successful');
      } else {
        this.lifecycleManager.transition(action, ActionState.FAILED, 'Purchase failed (market error)');
      }
    }
  }
}
