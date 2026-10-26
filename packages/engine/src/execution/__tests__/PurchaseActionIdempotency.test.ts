import { WorldEngine } from '../../world/WorldEngine';
import { TimeEngine } from '../../time/TimeEngine';
import { EventScheduler } from '../../events/EventScheduler';
import { InventoryManager } from '../../inventory/InventoryManager';
import { CitizenService } from '../../citizen/services/CitizenService';
import { InMemoryCitizenRepository } from '../../citizen/repositories/InMemoryCitizenRepository';
import { SpatialEngine } from '../../spatial/SpatialEngine';
import { MarketEngine } from '../../market/MarketEngine';
import { StoreRanker } from '../../decision/scoring/StoreRanker';
import { CitizenGender, WorkplaceType, ActionType, ActionState } from '@genesis/shared';

describe('T8.6.6.4 — Consumer Purchase Idempotency & Transaction Safety (Engine Unit Tests)', () => {
  let worldEngine: WorldEngine;
  let timeEngine: TimeEngine;
  let eventScheduler: EventScheduler;
  let marketEngine: MarketEngine;
  let inventoryManager: InventoryManager;
  let citizenService: CitizenService;
  let spatialEngine: SpatialEngine;
  let storeRanker: StoreRanker;
  let store: any;
  let district: any;

  beforeEach(() => {
    worldEngine = new WorldEngine();
    timeEngine = new TimeEngine();
    eventScheduler = new EventScheduler(timeEngine);
    inventoryManager = new InventoryManager();
    spatialEngine = new SpatialEngine(worldEngine, eventScheduler);

    const citizenRepo = new InMemoryCitizenRepository();
    citizenService = new CitizenService(
      citizenRepo,
      worldEngine,
      timeEngine,
      eventScheduler,
      spatialEngine.queryService,
      new (require('../../citizen/services/HouseholdService').HouseholdService)(inventoryManager)
    );

    marketEngine = new MarketEngine(
      worldEngine,
      timeEngine,
      eventScheduler,
      (id) => citizenService.getCitizen(id)?.wallet
    );

    storeRanker = new StoreRanker(marketEngine, inventoryManager);
    citizenService.actionExecutor.setMarketEngine(marketEngine, storeRanker, spatialEngine.queryService);

    // Setup world, region, district, store
    worldEngine.worldManager.createWorld('Genesis', 'Test', 123);
    const region = worldEngine.regionManager.createRegion({ name: 'r1', location: { x: 0, y: 0 } } as any);
    const city = worldEngine.cityManager.createCity({ name: 'c1', regionId: region.id, location: { x: 0, y: 0 } } as any);
    district = worldEngine.districtManager.createDistrict({ name: 'd1', cityId: city.id, type: 'COMMERCIAL' } as any);

    store = {
      id: 'store-1',
      type: WorkplaceType.SHOP,
      locationId: district.id,
      regionId: region.id,
      capacity: 10,
      occupiedPositions: 0,
      vacancies: 1,
      positions: [],
      inventoryId: 'inv-store-1',
      wallet: { id: 'wallet-store-1', ownerId: 'store-1', balance: 1000, totalIncome: 0, totalExpenses: 0, currency: 'INR' }
    };
    worldEngine.workplaceRepository.create(store as any);

    inventoryManager.createInventory('inv-store-1', 'store-1', 1000);
    inventoryManager.addItemQuantity('inv-store-1', 'wheat', 100, 'kg');
  });

  it('1. assigns a stable transaction ID to the purchase action before first execution', () => {
    const citizen = citizenService.createCitizen(CitizenGender.FEMALE, district.id);
    citizen.wallet.balance = 500;
    citizen.locationId = 'store-1';

    const candidate = {
      type: ActionType.PURCHASE,
      source: 'HUNGER',
      reason: 'Need food',
      target: { id: 'store-1', type: 'BUILDING' },
      metadata: { productId: 'wheat', targetQuantity: 2, sellerId: 'store-1' }
    };

    const action = citizenService.actionExecutor.executeAction(citizen, candidate);

    expect(action.metadata?.transactionId).toBeDefined();
    expect(action.metadata?.transactionId).toBe(`TX-PURCHASE-${action.actionId}`);
    expect(action.metadata?.transactionId.startsWith('TX-PURCHASE-')).toBe(true);
  });

  it('2. replaying the same purchase action does NOT debit the citizen twice or credit store twice', () => {
    const citizen = citizenService.createCitizen(CitizenGender.FEMALE, district.id);
    citizen.wallet.balance = 500;
    citizen.locationId = 'store-1';

    const candidate = {
      type: ActionType.PURCHASE,
      source: 'HUNGER',
      reason: 'Need food',
      target: { id: 'store-1', type: 'BUILDING' },
      metadata: { productId: 'wheat', targetQuantity: 2, sellerId: 'store-1' }
    };

    // First execution
    const action = citizenService.actionExecutor.executeAction(citizen, candidate);
    expect(action.state).toBe(ActionState.COMPLETED);

    const citizenBalanceAfter1 = citizen.wallet.balance;
    const storeBalanceAfter1 = store.wallet.balance;
    expect(citizenBalanceAfter1).toBe(480); // 500 - (10 * 2)
    expect(storeBalanceAfter1).toBe(1020); // 1000 + 20

    // Force re-tick of the same action multiple times
    for (let i = 0; i < 5; i++) {
      citizenService.actionExecutor.tick(citizen);
    }

    expect(citizen.wallet.balance).toBe(citizenBalanceAfter1);
    expect(store.wallet.balance).toBe(storeBalanceAfter1);

    // Replay by passing the exact same action to executeAction again with same metadata
    action.state = ActionState.PURCHASING;
    citizenService.actionExecutor.tick(citizen);

    expect(citizen.wallet.balance).toBe(citizenBalanceAfter1);
    expect(store.wallet.balance).toBe(storeBalanceAfter1);
    expect(action.state).toBe(ActionState.COMPLETED);
  });

  it('3. replaying the same purchase action does NOT deliver goods twice', () => {
    const citizen = citizenService.createCitizen(CitizenGender.MALE, district.id);
    citizen.wallet.balance = 500;
    citizen.locationId = 'store-1';

    const candidate = {
      type: ActionType.PURCHASE,
      source: 'HUNGER',
      reason: 'Need food',
      target: { id: 'store-1', type: 'BUILDING' },
      metadata: { productId: 'wheat', targetQuantity: 5, sellerId: 'store-1' }
    };

    const action = citizenService.actionExecutor.executeAction(citizen, candidate);
    expect(action.state).toBe(ActionState.COMPLETED);

    const storeStockAfter1 = inventoryManager.getInventory('inv-store-1')?.items['wheat']?.totalQuantity;
    expect(storeStockAfter1).toBe(95); // 100 - 5

    const householdInvId = citizen.householdId ? citizenService.householdService.getHousehold(citizen.householdId)?.inventoryId || '' : `inv-${citizen.id}`;
    const buyerStockAfter1 = inventoryManager.getInventory(householdInvId)?.items['wheat']?.totalQuantity;
    // 20 starter (if household) + 5 = 25, or 5 if personal
    expect(buyerStockAfter1 === 25 || buyerStockAfter1 === 5).toBe(true);

    // Re-tick and simulate replay
    for (let i = 0; i < 5; i++) {
      citizenService.actionExecutor.tick(citizen);
    }

    action.state = ActionState.PURCHASING;
    citizenService.actionExecutor.tick(citizen);

    const storeStockAfterReplay = inventoryManager.getInventory('inv-store-1')?.items['wheat']?.totalQuantity;
    const buyerStockAfterReplay = inventoryManager.getInventory(householdInvId)?.items['wheat']?.totalQuantity;

    expect(storeStockAfterReplay).toBe(storeStockAfter1);
    expect(buyerStockAfterReplay).toBe(buyerStockAfter1);
  });

  it('4. two distinct purchases by the same citizen for the same product are both allowed', () => {
    const citizen = citizenService.createCitizen(CitizenGender.FEMALE, district.id);
    citizen.wallet.balance = 500;
    citizen.locationId = 'store-1';

    // Purchase 1
    const action1 = citizenService.actionExecutor.executeAction(citizen, {
      type: ActionType.PURCHASE,
      source: 'HUNGER',
      reason: 'First purchase',
      target: { id: 'store-1', type: 'BUILDING' },
      metadata: { productId: 'wheat', targetQuantity: 2, sellerId: 'store-1' }
    });
    expect(action1.state).toBe(ActionState.COMPLETED);
    expect(citizen.wallet.balance).toBe(480);
    expect(inventoryManager.getInventory('inv-store-1')?.items['wheat']?.totalQuantity).toBe(98);

    // Purchase 2 (genuinely new action)
    const action2 = citizenService.actionExecutor.executeAction(citizen, {
      type: ActionType.PURCHASE,
      source: 'HUNGER',
      reason: 'Second purchase',
      target: { id: 'store-1', type: 'BUILDING' },
      metadata: { productId: 'wheat', targetQuantity: 3, sellerId: 'store-1' }
    });
    expect(action2.state).toBe(ActionState.COMPLETED);
    expect(action2.actionId).not.toBe(action1.actionId);
    expect(action2.metadata?.transactionId).not.toBe(action1.metadata?.transactionId);

    expect(citizen.wallet.balance).toBe(450); // 480 - 30
    expect(store.wallet.balance).toBe(1050); // 1000 + 20 + 30
    expect(inventoryManager.getInventory('inv-store-1')?.items['wheat']?.totalQuantity).toBe(95); // 98 - 3
  });

  it('5. fails gracefully without financial or inventory mutation on insufficient funds', () => {
    const citizen = citizenService.createCitizen(CitizenGender.FEMALE, district.id);
    citizen.wallet.balance = 15; // Needs 50 for 5 wheat
    citizen.locationId = 'store-1';

    const action = citizenService.actionExecutor.executeAction(citizen, {
      type: ActionType.PURCHASE,
      source: 'HUNGER',
      reason: 'Cannot afford',
      target: { id: 'store-1', type: 'BUILDING' },
      metadata: { productId: 'wheat', targetQuantity: 5, sellerId: 'store-1' }
    });

    expect(action.state).toBe(ActionState.FAILED);
    expect(action.failureReason).toBe('Insufficient funds');
    expect(citizen.wallet.balance).toBe(15);
    expect(store.wallet.balance).toBe(1000);
    expect(inventoryManager.getInventory('inv-store-1')?.items['wheat']?.totalQuantity).toBe(100);
  });

  it('6. fails gracefully without financial or inventory mutation when store is out of stock', () => {
    const citizen = citizenService.createCitizen(CitizenGender.FEMALE, district.id);
    citizen.wallet.balance = 5000;
    citizen.locationId = 'store-1';

    // Store only has 100, try to buy 150
    const action = citizenService.actionExecutor.executeAction(citizen, {
      type: ActionType.PURCHASE,
      source: 'HUNGER',
      reason: 'Excess quantity',
      target: { id: 'store-1', type: 'BUILDING' },
      metadata: { productId: 'wheat', targetQuantity: 150, sellerId: 'store-1' }
    });

    expect(action.state).toBe(ActionState.FAILED);
    expect(action.failureReason).toBe('Store out of stock');
    expect(citizen.wallet.balance).toBe(5000);
    expect(store.wallet.balance).toBe(1000);
    expect(inventoryManager.getInventory('inv-store-1')?.items['wheat']?.totalQuantity).toBe(100);
  });

  it('7. fails gracefully without financial or inventory mutation when destination capacity is full', () => {
    const citizen = citizenService.createCitizen(CitizenGender.FEMALE, district.id);
    citizen.wallet.balance = 500;
    citizen.locationId = 'store-1';

    // Fill citizen's personal inventory to capacity (capacity 100)
    const personalInv = inventoryManager.createInventory(`inv-${citizen.id}`, citizen.id, 10);
    inventoryManager.addItemQuantity(personalInv.id, 'wheat', 10, 'kg');

    // Remove householdId so it targets personal inventory
    citizen.householdId = undefined;

    const action = citizenService.actionExecutor.executeAction(citizen, {
      type: ActionType.PURCHASE,
      source: 'HUNGER',
      reason: 'Inventory full',
      target: { id: 'store-1', type: 'BUILDING' },
      metadata: { productId: 'wheat', targetQuantity: 5, sellerId: 'store-1' }
    });

    expect(action.state).toBe(ActionState.FAILED);
    expect(action.failureReason).toBe('Destination inventory capacity full');
    expect(citizen.wallet.balance).toBe(500);
    expect(store.wallet.balance).toBe(1000);
    expect(inventoryManager.getInventory('inv-store-1')?.items['wheat']?.totalQuantity).toBe(100);
  });

  it('8. executes compensation refund if delivery fails, conserving total money', () => {
    const citizen = citizenService.createCitizen(CitizenGender.FEMALE, district.id);
    citizen.wallet.balance = 500;
    citizen.locationId = 'store-1';

    // Mock transferItemQuantity to simulate delivery failure after payment
    const originalTransfer = inventoryManager.transferItemQuantity.bind(inventoryManager);
    jest.spyOn(inventoryManager, 'transferItemQuantity').mockImplementationOnce(() => false);

    const action = citizenService.actionExecutor.executeAction(citizen, {
      type: ActionType.PURCHASE,
      source: 'HUNGER',
      reason: 'Delivery failure simulation',
      target: { id: 'store-1', type: 'BUILDING' },
      metadata: { productId: 'wheat', targetQuantity: 2, sellerId: 'store-1' }
    });

    expect(action.state).toBe(ActionState.FAILED);
    expect(action.failureReason).toContain('payment refunded');

    // Citizen refunded, store decremented, money strictly conserved
    expect(citizen.wallet.balance).toBe(500);
    expect(store.wallet.balance).toBe(1000);
    expect(marketEngine.isTransactionReversed(action.metadata!.transactionId)).toBe(true);

    // Restore spy
    (inventoryManager.transferItemQuantity as any).mockRestore();
  });

  it('9. replaying a reversed purchase action rejects reusing the reversed transaction ID', () => {
    const citizen = citizenService.createCitizen(CitizenGender.FEMALE, district.id);
    citizen.wallet.balance = 500;
    citizen.locationId = 'store-1';

    // Simulate delivery failure compensation
    jest.spyOn(inventoryManager, 'transferItemQuantity').mockImplementationOnce(() => false);

    const action = citizenService.actionExecutor.executeAction(citizen, {
      type: ActionType.PURCHASE,
      source: 'HUNGER',
      reason: 'Failed delivery',
      target: { id: 'store-1', type: 'BUILDING' },
      metadata: { productId: 'wheat', targetQuantity: 2, sellerId: 'store-1' }
    });

    expect(action.state).toBe(ActionState.FAILED);
    (inventoryManager.transferItemQuantity as any).mockRestore();

    // Replay the reversed action
    action.state = ActionState.PURCHASING;
    citizenService.actionExecutor.tick(citizen);

    expect(action.state).toBe(ActionState.FAILED);
    expect(action.failureReason).toContain('reversed');
    expect(citizen.wallet.balance).toBe(500);
  });

  it('10. cold-restart transaction hydration prevents re-debit and re-delivery upon replay', () => {
    const citizen = citizenService.createCitizen(CitizenGender.FEMALE, district.id);
    citizen.wallet.balance = 480; // Already debited in previous session
    citizen.locationId = 'store-1';

    const txId = 'TX-PURCHASE-pre-restart-action';

    // Hydrate market engine with transaction from prior session (e.g. loaded from SQLite)
    marketEngine.loadTransactions([
      {
        transactionId: txId,
        timestamp: 100,
        buyerId: citizen.id,
        sellerId: 'store-1',
        productId: 'wheat',
        quantity: 2,
        unit: 'kg',
        unitPrice: 10,
        totalPrice: 20,
        currency: 'INR',
        transactionType: 'PURCHASE' as any,
        regionId: 'r1'
      }
    ]);

    expect(marketEngine.hasTransaction(txId)).toBe(true);

    // Now an action referencing that txId is replayed
    const action = citizenService.actionExecutor.executeAction(citizen, {
      type: ActionType.PURCHASE,
      source: 'HUNGER',
      reason: 'Replay post-restart',
      target: { id: 'store-1', type: 'BUILDING' },
      metadata: { actionId: 'pre-restart-action', transactionId: txId, productId: 'wheat', targetQuantity: 2, sellerId: 'store-1' }
    });

    expect(action.state).toBe(ActionState.COMPLETED);
    // Balances unchanged
    expect(citizen.wallet.balance).toBe(480);
    expect(store.wallet.balance).toBe(1000);
    // Stock unchanged
    expect(inventoryManager.getInventory('inv-store-1')?.items['wheat']?.totalQuantity).toBe(100);
  });
});
