import { worldService } from '../../services/world.service';
import { timeService } from '../../services/time.service';
import { eventService } from '../../services/event.service';
import { spatialService } from '../../services/spatial.service';
import { supplyService } from '../../services/supply.service';
import { marketService } from '../../services/market.service';
import { WorkplaceType } from '@genesis/shared';
import { MarketEngine } from '@genesis/engine';

describe('B2B Transaction Integrity & MarketEngine Injection (GAP-1 Regression)', () => {
  beforeEach(() => {
    // Reset World and Supply services to a clean state
    worldService.engine.reset();
    marketService.initialize();
    supplyService.reset();
  });

  it('1. Procurement engine receives the correct MarketEngine during initialization', () => {
    expect(marketService.engine).toBeDefined();
    expect(supplyService.getMarketEngine()).toBe(marketService.engine);
    expect(supplyService.businessProcurementEngine.getMarketEngine()).toBe(marketService.engine);
  });

  it('2. SupplyService.reset() preserves or correctly restores the MarketEngine dependency', () => {
    const originalMarketEngine = marketService.engine;

    // Trigger reset without arguments
    supplyService.reset();

    // Verify MarketEngine reference is NOT lost on reset
    expect(supplyService.getMarketEngine()).toBe(originalMarketEngine);
    expect(supplyService.businessProcurementEngine.getMarketEngine()).toBe(originalMarketEngine);

    // Also verify resetting with an explicit MarketEngine updates both SupplyService and BusinessProcurementEngine
    const customMarketEngine = new MarketEngine(
      worldService.engine,
      timeService.engine,
      eventService.scheduler
    );
    supplyService.reset(customMarketEngine);
    expect(supplyService.getMarketEngine()).toBe(customMarketEngine);
    expect(supplyService.businessProcurementEngine.getMarketEngine()).toBe(customMarketEngine);

    // Restore marketService.engine
    supplyService.reset(originalMarketEngine);
    expect(supplyService.getMarketEngine()).toBe(originalMarketEngine);
    expect(supplyService.businessProcurementEngine.getMarketEngine()).toBe(originalMarketEngine);
  });

  it('3 & 4. A valid B2B purchase after reset routes through MarketEngine.processTransaction() and creates ledger entries exactly once', () => {
    // Ensure we are operating on a post-reset instance
    supplyService.reset();
    expect(supplyService.businessProcurementEngine.getMarketEngine()).toBe(marketService.engine);

    const buyerId = 'b2b-test-shop';
    const sellerId = 'b2b-test-wholesale';

    // Create inventories
    const buyerInvId = `inv-${buyerId}`;
    const sellerInvId = `inv-${sellerId}`;
    supplyService.inventoryManager.createInventory(buyerInvId, buyerId, 2000);
    supplyService.inventoryManager.createInventory(sellerInvId, sellerId, 2000);

    // Stock seller with 500 kg wheat
    supplyService.inventoryManager.addItemQuantity(sellerInvId, 'wheat', 500, 'kg');

    const buyerWallet = {
      id: `wallet-${buyerId}`,
      ownerId: buyerId,
      balance: 50000,
      currency: 'GEN',
      totalIncome: 0,
      totalExpenses: 0
    };

    const sellerWallet = {
      id: `wallet-${sellerId}`,
      ownerId: sellerId,
      balance: 1000,
      currency: 'GEN',
      totalIncome: 0,
      totalExpenses: 0
    };

    worldEngineWorkplace(buyerId, WorkplaceType.SHOP, buyerInvId, 2000, buyerWallet, {
      'wheat': { reorderPoint: 50, targetStock: 200 }
    });

    worldEngineWorkplace(sellerId, WorkplaceType.WHOLESALE, sellerInvId, 2000, sellerWallet);

    // Mock distance to a deterministic value
    jest.spyOn(spatialService.engine.queryService, 'calculateRoute').mockReturnValue({ distance: 10 } as any);

    // Spy on MarketEngine.processTransaction
    const processTxSpy = jest.spyOn(marketService.engine, 'processTransaction');

    // Run procurement cycle
    supplyService.businessProcurementEngine.runProcurementCycle();

    // Verify processTransaction was invoked
    expect(processTxSpy).toHaveBeenCalled();

    // Verify that the purchase transaction was recorded in the MarketEngine ledger
    const buyerTransactions = marketService.engine.getTransactionsByEntity(buyerId);
    expect(buyerTransactions.length).toBeGreaterThanOrEqual(1);

    const purchaseTx = buyerTransactions.find(t => t.sellerId === sellerId && t.productId === 'wheat');
    expect(purchaseTx).toBeDefined();
    expect(purchaseTx!.quantity).toBe(200);
    expect(purchaseTx!.transactionType).toBe('RETAIL_PROCUREMENT');
    expect(purchaseTx!.totalPrice).toBeGreaterThan(0);

    // Verify it is recorded exactly once
    const matchingTxs = buyerTransactions.filter(t => t.sellerId === sellerId && t.productId === 'wheat');
    expect(matchingTxs.length).toBe(1);

    // Verify wallet accounting was executed through the authoritative pipeline
    expect(buyerWallet.totalExpenses).toBeGreaterThan(0);
    expect(sellerWallet.totalIncome).toBe(purchaseTx!.totalPrice);
    expect(sellerWallet.balance).toBe(1000 + purchaseTx!.totalPrice);

    // Verify SupplyChain order was created
    const orders = supplyService.supplyChainEngine.getOrdersForBusiness(buyerId);
    expect(orders.length).toBe(1);
    expect(orders[0].quantity).toBe(200);
  });

  it('5. Invalid or failed transactions with insufficient funds do not create successful ledger entries', () => {
    supplyService.reset();

    const brokeBuyerId = 'b2b-broke-shop';
    const sellerId = 'b2b-wholesale-provider';

    const buyerInvId = `inv-${brokeBuyerId}`;
    const sellerInvId = `inv-${sellerId}`;
    supplyService.inventoryManager.createInventory(buyerInvId, brokeBuyerId, 2000);
    supplyService.inventoryManager.createInventory(sellerInvId, sellerId, 2000);

    supplyService.inventoryManager.addItemQuantity(sellerInvId, 'wheat', 500, 'kg');

    const brokeWallet = {
      id: `wallet-${brokeBuyerId}`,
      ownerId: brokeBuyerId,
      balance: 0, // Cannot afford anything
      currency: 'GEN',
      totalIncome: 0,
      totalExpenses: 0
    };

    const sellerWallet = {
      id: `wallet-${sellerId}`,
      ownerId: sellerId,
      balance: 5000,
      currency: 'GEN',
      totalIncome: 0,
      totalExpenses: 0
    };

    worldEngineWorkplace(brokeBuyerId, WorkplaceType.SHOP, buyerInvId, 2000, brokeWallet, {
      'wheat': { reorderPoint: 50, targetStock: 200 }
    });

    worldEngineWorkplace(sellerId, WorkplaceType.WHOLESALE, sellerInvId, 2000, sellerWallet);

    jest.spyOn(spatialService.engine.queryService, 'calculateRoute').mockReturnValue({ distance: 10 } as any);

    const initialTxCount = marketService.engine.getTransactionsByEntity(brokeBuyerId).length;

    supplyService.businessProcurementEngine.runProcurementCycle();

    // Verify no new transaction was recorded in MarketEngine
    const afterTxCount = marketService.engine.getTransactionsByEntity(brokeBuyerId).length;
    expect(afterTxCount).toBe(initialTxCount);

    // Wallets must remain untouched
    expect(brokeWallet.balance).toBe(0);
    expect(brokeWallet.totalExpenses).toBe(0);
    expect(sellerWallet.balance).toBe(5000);
    expect(sellerWallet.totalIncome).toBe(0);

    // No supply order should be dispatched
    const orders = supplyService.supplyChainEngine.getOrdersForBusiness(brokeBuyerId);
    expect(orders.length).toBe(0);
  });

  function worldEngineWorkplace(
    id: string,
    type: WorkplaceType,
    inventoryId: string,
    storageCapacity: number,
    wallet: any,
    inventoryConfiguration?: Record<string, { reorderPoint: number; targetStock: number }>
  ) {
    worldService.engine.workplaceRepository.create({
      id,
      type,
      regionId: 'reg-default',
      locationId: `loc-${id}`,
      capacity: 10,
      occupiedPositions: 0,
      vacancies: 10,
      positions: [],
      inventoryId,
      storageCapacity,
      wallet,
      inventoryConfiguration
    });
  }
});
