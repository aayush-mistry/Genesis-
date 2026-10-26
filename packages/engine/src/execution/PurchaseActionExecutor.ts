import { ActionType, ActionState, TransactionType, DecisionContext } from '@genesis/shared';
import { BaseActionExecutor, ActionExecutorContext } from './BaseActionExecutor';
import { ActionLifecycleManager } from './ActionLifecycleManager';
import { MarketEngine } from '../market/MarketEngine';
import { MovementService } from '../citizen/services/MovementService';
import { StoreRanker, StoreCandidate } from '../decision/scoring/StoreRanker';
import { SpatialQueryService } from '../spatial/SpatialQueryService';
import { TimeUtils } from '../utils/TimeUtils';

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

    action.metadata = action.metadata || {};
    const productId = action.metadata?.productId || 'wheat';
    const quantity = action.metadata?.targetQuantity ?? action.metadata?.quantity ?? 1;

    // Ensure deterministic transaction ID before first execution
    if (!action.metadata.transactionId) {
      action.metadata.transactionId = action.actionId
        ? `TX-PURCHASE-${action.actionId}`
        : `TX-PURCHASE-${citizen.id}-${productId}-${action.target?.id || 'store'}-${TimeUtils.toSeconds(context.currentTime)}`;
    }

    if (!action.target || !action.target.id) {
      // Store Discovery
      const citizenCoords = (this.spatialQueryService as any).worldEngine?.getEntityCoordinates(citizen.locationId || '');
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
      action.metadata.sellerId = rankedStores[0].sellerId || rankedStores[0].id;
    }

    console.log(`[PurchaseActionExecutor] START. citizen.locationId=${citizen.locationId}, action.target.id=${action.target?.id}`);
    
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

    if (action.state === ActionState.COMPLETED || action.state === ActionState.CANCELLED) {
      return;
    }

    if (action.state === ActionState.TRAVELING) {
      if (citizen.locationId === action.target?.id) {
        this.lifecycleManager.transition(action, ActionState.SHOPPING, 'Arrived at store');
      } else {
        return; // Still travelling
      }
    }

    if (action.state === ActionState.SHOPPING || action.state === ActionState.IN_PROGRESS || action.state === ActionState.STARTED) {
      this.lifecycleManager.transition(action, ActionState.PURCHASING, 'Proceeding to checkout');
    }

    if (action.state === ActionState.PURCHASING) {
      action.metadata = action.metadata || {};
      const sellerId = action.metadata?.sellerId || action.target?.id;
      if (!sellerId) {
        this.lifecycleManager.transition(action, ActionState.FAILED, 'Missing store target');
        return;
      }

      const productId = action.metadata?.productId || 'wheat';
      const quantity = action.metadata?.targetQuantity ?? action.metadata?.quantity ?? 1;
      const unit = productId === 'water' ? 'L' : 'kg';

      // Ensure stable transaction ID
      if (!action.metadata.transactionId) {
        action.metadata.transactionId = action.actionId
          ? `TX-PURCHASE-${action.actionId}`
          : `TX-PURCHASE-${citizen.id}-${productId}-${sellerId}-${TimeUtils.toSeconds(context.currentTime)}`;
      }
      const transactionId = action.metadata.transactionId;

      // 1. Idempotency Check:
      // If goods were already delivered or this transaction was already processed in the market engine
      if (action.metadata.goodsDelivered === true || this.marketEngine.hasTransaction(transactionId)) {
        if (this.marketEngine.isTransactionReversed(transactionId)) {
          this.lifecycleManager.transition(action, ActionState.FAILED, 'Transaction was previously reversed');
          return;
        }
        // Already executed: do not debit citizen again and do not deliver goods again
        action.metadata.goodsDelivered = true;
        this.lifecycleManager.transition(action, ActionState.COMPLETED, 'Purchase already completed (idempotent replay)');
        return;
      }

      // 2. Check if store is in a region to get regional pricing
      let regionId = 'DEFAULT';
      try {
        const workplaceRepo = (this.spatialQueryService as any)?.worldEngine?.workplaceRepository;
        if (workplaceRepo) {
          const sellerWp = workplaceRepo.findById(sellerId);
          if (sellerWp?.regionId) {
            regionId = sellerWp.regionId;
          }
        }
      } catch (e) {}
      
      // Get expected price and quantity
      const basePrice = 10;
      const unitPrice = this.marketEngine.calculateEffectivePrice(productId, regionId, basePrice);
      const finalPrice = unitPrice * quantity;

      // 3. Validation: Affordability
      if (citizen.wallet.balance < finalPrice) {
        this.lifecycleManager.transition(action, ActionState.FAILED, 'Insufficient funds');
        return;
      }

      // 4. Validation: Merchant inventory & usable stock
      const inventory = this.storeRanker['inventoryManager'].getInventoryByOwner(sellerId);
      if (!inventory) {
        this.lifecycleManager.transition(action, ActionState.FAILED, 'Store has no inventory');
        return;
      }

      const timeSeconds = TimeUtils.toSeconds(context.currentTime);
      const available = this.storeRanker['inventoryManager'].getUsableQuantity(inventory.id, productId, timeSeconds);
      if (available < quantity) {
        this.lifecycleManager.transition(action, ActionState.FAILED, 'Store out of stock');
        return;
      }

      // 5. Validation: Destination inventory & capacity
      let destInventory: any = undefined;
      if (citizen.householdId) {
        destInventory = this.storeRanker['inventoryManager'].getInventoryByOwner(citizen.householdId);
      }
      if (!destInventory) {
        destInventory = this.storeRanker['inventoryManager'].getInventoryByOwner(citizen.id);
        if (!destInventory) {
          destInventory = this.storeRanker['inventoryManager'].createInventory(`inv-${citizen.id}`, citizen.id, 100);
        }
      }

      let destCurrentTotal = 0;
      for (const item of Object.values(destInventory.items as Record<string, any>)) {
        destCurrentTotal += item.totalQuantity;
      }
      if (destCurrentTotal + quantity > destInventory.storageCapacity) {
        this.lifecycleManager.transition(action, ActionState.FAILED, 'Destination inventory capacity full');
        return;
      }

      // 6. Step 1: Financial Transaction
      const transaction = this.marketEngine.processTransaction(
        citizen.id,
        sellerId,
        productId,
        quantity,
        unit,
        unitPrice,
        finalPrice,
        citizen.wallet.currency,
        TransactionType.PURCHASE,
        regionId,
        transactionId
      );

      if (!transaction) {
        this.lifecycleManager.transition(action, ActionState.FAILED, 'Purchase failed (market transaction error)');
        return;
      }

      // 7. Step 2: Inventory Delivery
      let transferred = false;
      try {
        transferred = this.storeRanker['inventoryManager'].transferItemQuantity(
          inventory.id,
          destInventory.id,
          productId,
          quantity,
          unit
        );
      } catch (err) {
        transferred = false;
      }

      // 8. Compensation if delivery fails
      if (!transferred) {
        console.warn(`[PurchaseActionExecutor] Delivery failed for tx ${transactionId}. Executing compensation refund.`);
        this.marketEngine.reverseTransaction(
          transactionId,
          `${transactionId}-REV-DELIVERY`,
          'Inventory transfer failed'
        );
        this.lifecycleManager.transition(action, ActionState.FAILED, 'Inventory transfer failed (payment refunded)');
        return;
      }

      // 9. Success: Mark goods delivered & complete action
      action.metadata.goodsDelivered = true;
      action.metadata.completedAt = TimeUtils.toSeconds(context.currentTime);
      this.lifecycleManager.transition(action, ActionState.COMPLETED, 'Purchase successful');
    }
  }
}
