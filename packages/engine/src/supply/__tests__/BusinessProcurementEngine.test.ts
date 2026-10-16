import { BusinessProcurementEngine } from '../BusinessProcurementEngine';
import { WorldEngine } from '../../world/WorldEngine';
import { InventoryManager } from '../../inventory/InventoryManager';
import { SupplyChainEngine } from '../SupplyChainEngine';
import { EventScheduler } from '../../events/EventScheduler';
import { TimeEngine } from '../../time/TimeEngine';
import { SpatialQueryService } from '../../spatial/SpatialQueryService';
import { GridSpatialIndex } from '../../spatial/GridSpatialIndex';
import { WorkplaceType, OrderStatus } from '@genesis/shared';
import { MarketEngine } from '../../market/MarketEngine';

describe('BusinessProcurementEngine', () => {
  let worldEngine: WorldEngine;
  let inventoryManager: InventoryManager;
  let supplyChainEngine: SupplyChainEngine;
  let eventScheduler: EventScheduler;
  let timeEngine: TimeEngine;
  let spatialQueryService: SpatialQueryService;
  let engine: BusinessProcurementEngine;

  beforeEach(() => {
    worldEngine = new WorldEngine();
    inventoryManager = new InventoryManager();
    timeEngine = new TimeEngine();
    eventScheduler = new EventScheduler(timeEngine);
    const spatialIndex = new GridSpatialIndex(100); // Need cell size, say 100
    spatialQueryService = new SpatialQueryService(spatialIndex, worldEngine);
    supplyChainEngine = new SupplyChainEngine(worldEngine, eventScheduler, timeEngine, inventoryManager, spatialQueryService);
    
    engine = new BusinessProcurementEngine(
      worldEngine,
      inventoryManager,
      supplyChainEngine,
      spatialQueryService,
      eventScheduler,
      timeEngine
    );
  });

  test('Business below reorder point creates requirement', () => {
    // Setup
    const buyerId = 'shop-1';
    inventoryManager.createInventory(`inv-${buyerId}`, buyerId, 1000);
    inventoryManager.addItemQuantity(`inv-${buyerId}`, 'wheat', 10, 'kg');

    worldEngine.workplaceRepository.create({
      id: buyerId,
      type: WorkplaceType.SHOP,
      regionId: 'reg-1',
      locationId: 'loc-1',
      capacity: 10,
      occupiedPositions: 0,
      vacancies: 10,
      positions: [],
      inventoryId: `inv-${buyerId}`,
      storageCapacity: 1000,
      inventoryConfiguration: {
        'wheat': { reorderPoint: 50, targetStock: 200 }
      }
    });

    engine.runProcurementCycle();

    const requirements = (engine as any).pendingRequirements;
    expect(requirements.length).toBe(1);
    expect(requirements[0].requestedQuantity).toBe(190); // 200 target - 10 current
    expect(requirements[0].status).toBe('FAILED'); // Failed because no suppliers exist yet
  });

  test('Business above reorder point does nothing', () => {
    // Setup
    const buyerId = 'shop-1';
    inventoryManager.createInventory(`inv-${buyerId}`, buyerId, 1000);
    inventoryManager.addItemQuantity(`inv-${buyerId}`, 'wheat', 60, 'kg'); // Above reorder point 50

    worldEngine.workplaceRepository.create({
      id: buyerId,
      type: WorkplaceType.SHOP,
      regionId: 'reg-1',
      locationId: 'loc-1',
      capacity: 10,
      occupiedPositions: 0,
      vacancies: 10,
      positions: [],
      inventoryId: `inv-${buyerId}`,
      storageCapacity: 1000,
      inventoryConfiguration: {
        'wheat': { reorderPoint: 50, targetStock: 200 }
      }
    });

    engine.runProcurementCycle();

    const requirements = engine.getPendingRequirements();
    expect(requirements.length).toBe(0);
  });

  test('Storage capacity limits order quantity', () => {
    // Setup
    const buyerId = 'shop-1';
    inventoryManager.createInventory(`inv-${buyerId}`, buyerId, 100); // Only 100 capacity
    inventoryManager.addItemQuantity(`inv-${buyerId}`, 'wheat', 10, 'kg');

    worldEngine.workplaceRepository.create({
      id: buyerId,
      type: WorkplaceType.SHOP,
      regionId: 'reg-1',
      locationId: 'loc-1',
      capacity: 10,
      occupiedPositions: 0,
      vacancies: 10,
      positions: [],
      inventoryId: `inv-${buyerId}`,
      storageCapacity: 100, // Small storage
      inventoryConfiguration: {
        'wheat': { reorderPoint: 50, targetStock: 200 } // target is 200
      }
    });

    engine.runProcurementCycle();

    const history = engine.getHistory();
    expect(history.length).toBe(1);
    expect(history[0].requestedQuantity).toBe(90); // Available space is 100 - 10 = 90. Max order limited to 90.
  });

  test('Successful supplier discovery and order creation (End-to-end)', () => {
    // Setup Buyer
    const buyerId = 'retail-1';
    inventoryManager.createInventory(`inv-${buyerId}`, buyerId, 1200);
    inventoryManager.addItemQuantity(`inv-${buyerId}`, 'wheat', 200, 'kg');

    worldEngine.workplaceRepository.create({
      id: buyerId,
      type: WorkplaceType.RETAIL,
      regionId: 'reg-1',
      locationId: 'loc-buyer',
      capacity: 10,
      occupiedPositions: 0,
      vacancies: 10,
      positions: [],
      inventoryId: `inv-${buyerId}`,
      storageCapacity: 1200,
      inventoryConfiguration: {
        'wheat': { reorderPoint: 500, targetStock: 1000 }
      },
      wallet: { id: 'w1', ownerId: buyerId, balance: 100000, currency: 'GEN', totalIncome: 0, totalExpenses: 0 }
    });

    // Setup Supplier A (1000 kg)
    const supplierA = 'farm-1';
    inventoryManager.createInventory(`inv-${supplierA}`, supplierA, 5000);
    inventoryManager.addItemQuantity(`inv-${supplierA}`, 'wheat', 1000, 'kg');

    worldEngine.workplaceRepository.create({
      id: supplierA,
      type: WorkplaceType.FARM,
      regionId: 'reg-1',
      locationId: 'loc-supp-a',
      capacity: 10,
      occupiedPositions: 0,
      vacancies: 10,
      positions: [],
      inventoryId: `inv-${supplierA}`,
      wallet: { id: 'w2', ownerId: supplierA, balance: 0, currency: 'GEN', totalIncome: 0, totalExpenses: 0 }
    });

    jest.spyOn(worldEngine, 'getEntityCoordinates').mockReturnValue({ x: 0, y: 0 });

    // We can skip distance since we don't strictly mock spatial route distances here, they will return 0 or default in test.
    engine.runProcurementCycle();

    const orders = supplyChainEngine.getOrdersForBusiness(buyerId);
    expect(orders.length).toBe(1);
    expect(orders[0].quantity).toBe(800); // 1000 target - 200 current
    expect(orders[0].sellerId).toBe(supplierA);

    // Verify Wallet deduction
    const buyerWp = worldEngine.workplaceRepository.findById(buyerId);
    expect(buyerWp?.wallet?.balance).toBeLessThan(100000); // Some amount deducted

    // Verify inventory reservation logic inside SupplyChainEngine via Order status
    expect(orders[0].status).toBe(OrderStatus.DISPATCHED);

    // Verify shipment was created
    const shipments = supplyChainEngine.getAllActiveShipments();
    expect(shipments.length).toBe(1);
    expect(shipments[0].quantity).toBe(800);
  });

  test('Supplier ranking uses actual inventory quality and prefers higher quality', () => {
    const buyerId = 'retail-2';
    inventoryManager.createInventory(`inv-${buyerId}`, buyerId, 1200);
    inventoryManager.addItemQuantity(`inv-${buyerId}`, 'wheat', 200, 'kg');

    worldEngine.workplaceRepository.create({
      id: buyerId,
      type: WorkplaceType.RETAIL,
      regionId: 'reg-1',
      locationId: 'loc-buyer',
      capacity: 10,
      occupiedPositions: 0,
      vacancies: 10,
      positions: [],
      inventoryId: `inv-${buyerId}`,
      storageCapacity: 1200,
      inventoryConfiguration: {
        'wheat': { reorderPoint: 500, targetStock: 1000 }
      },
      wallet: { id: 'w1', ownerId: buyerId, balance: 100000, currency: 'GEN', totalIncome: 0, totalExpenses: 0 }
    });

    const supplierHighQ = 'farm-high';
    inventoryManager.createInventory(`inv-${supplierHighQ}`, supplierHighQ, 5000);
    inventoryManager.addItemQuantity(`inv-${supplierHighQ}`, 'wheat', 1000, 'kg');
    const invHigh = inventoryManager.getInventory(`inv-${supplierHighQ}`);
    invHigh!.items['wheat'].quality = 95; // High quality

    worldEngine.workplaceRepository.create({
      id: supplierHighQ,
      type: WorkplaceType.FARM,
      regionId: 'reg-1',
      locationId: 'loc-supp-h',
      capacity: 10,
      occupiedPositions: 0,
      vacancies: 10,
      positions: [],
      inventoryId: `inv-${supplierHighQ}`,
      wallet: { id: 'w2', ownerId: supplierHighQ, balance: 0, currency: 'GEN', totalIncome: 0, totalExpenses: 0 }
    });

    const supplierLowQ = 'farm-low';
    inventoryManager.createInventory(`inv-${supplierLowQ}`, supplierLowQ, 5000);
    inventoryManager.addItemQuantity(`inv-${supplierLowQ}`, 'wheat', 1000, 'kg');
    const invLow = inventoryManager.getInventory(`inv-${supplierLowQ}`);
    invLow!.items['wheat'].quality = 65; // Low quality

    worldEngine.workplaceRepository.create({
      id: supplierLowQ,
      type: WorkplaceType.FARM,
      regionId: 'reg-1',
      locationId: 'loc-supp-l',
      capacity: 10,
      occupiedPositions: 0,
      vacancies: 10,
      positions: [],
      inventoryId: `inv-${supplierLowQ}`,
      wallet: { id: 'w3', ownerId: supplierLowQ, balance: 0, currency: 'GEN', totalIncome: 0, totalExpenses: 0 }
    });

    // We can intercept calculateRoute to make distance equal, so quality is the tiebreaker
    jest.spyOn(spatialQueryService, 'calculateRoute').mockReturnValue({ distance: 10 } as any);

    engine.runProcurementCycle();

    const orders = supplyChainEngine.getOrdersForBusiness(buyerId);
    expect(orders.length).toBe(1);
    
    // Should order from the higher quality supplier since distance and price are identical
    expect(orders[0].sellerId).toBe(supplierHighQ);
    
    // Check history ranking
    const history = engine.getHistory();
    const lastProc = history[history.length - 1];
    const topRank = lastProc.rankings[0];
    const secondRank = lastProc.rankings[1];
    
    expect(topRank.supplierId).toBe(supplierHighQ);
    expect(topRank.quality).toBe(95);
    
    expect(secondRank.supplierId).toBe(supplierLowQ);
    expect(secondRank.quality).toBe(65);
    
    expect(topRank.qualityScore).toBeGreaterThan(secondRank.qualityScore);
  });

  test('Forecast-driven procurement triggers before shelves become empty when projected shortage exists', () => {
    const { ConsumptionLedger, DemandForecastingEngine } = require('../../consumption');
    const ledger = new ConsumptionLedger();
    const forecaster = new DemandForecastingEngine(ledger);
    engine.setDemandForecaster(forecaster);

    const buyerId = 'shop-forecast-1';
    inventoryManager.createInventory(`inv-${buyerId}`, buyerId, 1000);
    // Stock is 55 (slightly ABOVE reorder point of 50, so normal rule wouldn't trigger)
    inventoryManager.addItemQuantity(`inv-${buyerId}`, 'wheat', 55, 'kg');

    worldEngine.workplaceRepository.create({
      id: buyerId,
      type: WorkplaceType.SHOP,
      regionId: 'reg-1',
      locationId: 'loc-1',
      capacity: 10,
      occupiedPositions: 0,
      vacancies: 10,
      positions: [],
      inventoryId: `inv-${buyerId}`,
      storageCapacity: 1000,
      inventoryConfiguration: {
        'wheat': { reorderPoint: 50, targetStock: 200 }
      }
    });

    // Populate actual historical consumption in ledger: 140 kg consumed over 7 days = 20 kg/day
    const daySeconds = 86400;
    timeEngine.setCurrentTime({ year: 1, month: 1, day: 8, hour: 0, minute: 0, second: 0 }); // Day 8
    const currentSeconds = 7 * daySeconds;

    for (let day = 0; day < 7; day++) {
      ledger.record({
        eventId: `hist-wheat-${day}`,
        timestamp: day * daySeconds + 3600,
        commodityId: 'wheat',
        regionId: 'reg-1',
        quantity: 20,
        unit: 'kg',
        context: 'CITIZEN_NEED'
      });
    }

    // Forecast demand over 1 day horizon is 20 kg.
    // Projected available supply = 55 - 20 = 35 kg.
    // 35 kg < reorderPoint (50), so a projected shortage is detected before stock empties!
    engine.runProcurementCycle();

    const requirements = (engine as any).pendingRequirements;
    expect(requirements.length).toBe(1);
    expect(requirements[0].productId).toBe('wheat');
    // Requested quantity accounts for forecast demand + restoring target stock:
    // targetStock (200) + forecast (20) - effectiveStock (55) = 165
    expect(requirements[0].requestedQuantity).toBe(165);
  });

  test('Inbound supply accounts for existing orders/shipments to prevent duplicate procurement', () => {
    const { ConsumptionLedger, DemandForecastingEngine } = require('../../consumption');
    const ledger = new ConsumptionLedger();
    const forecaster = new DemandForecastingEngine(ledger);
    engine.setDemandForecaster(forecaster);

    const buyerId = 'shop-inbound-1';
    inventoryManager.createInventory(`inv-${buyerId}`, buyerId, 1000);
    inventoryManager.addItemQuantity(`inv-${buyerId}`, 'wheat', 55, 'kg');

    worldEngine.workplaceRepository.create({
      id: buyerId,
      type: WorkplaceType.SHOP,
      regionId: 'reg-1',
      locationId: 'loc-1',
      capacity: 10,
      occupiedPositions: 0,
      vacancies: 10,
      positions: [],
      inventoryId: `inv-${buyerId}`,
      storageCapacity: 1000,
      inventoryConfiguration: {
        'wheat': { reorderPoint: 50, targetStock: 200 }
      }
    });

    // Populate historical consumption: 20 kg/day
    const daySeconds = 86400;
    timeEngine.setCurrentTime({ year: 1, month: 1, day: 8, hour: 0, minute: 0, second: 0 });
    for (let day = 0; day < 7; day++) {
      ledger.record({
        eventId: `hist-inbound-${day}`,
        timestamp: day * daySeconds + 3600,
        commodityId: 'wheat',
        regionId: 'reg-1',
        quantity: 20,
        unit: 'kg',
        context: 'CITIZEN_NEED'
      });
    }

    // Now suppose there is already an inbound confirmed order of 100 kg
    jest.spyOn(supplyChainEngine, 'getPendingIncomingQuantity').mockReturnValue(100);

    // Effective stock = 55 current + 100 inbound = 155 kg.
    // Projected stock = 155 - 20 forecast = 135 kg.
    // 135 kg is well above reorderPoint (50), so NO procurement should be triggered!
    engine.runProcurementCycle();

    const requirements = (engine as any).pendingRequirements;
    expect(requirements.length).toBe(0);
  });

  test('MarketEngine explicit dependency injection and retrieval', () => {
    const marketEngine = new MarketEngine(worldEngine, timeEngine, eventScheduler);
    expect(engine.getMarketEngine()).toBeUndefined();

    engine.setMarketEngine(marketEngine);
    expect(engine.getMarketEngine()).toBe(marketEngine);

    // Also constructor injection
    const engineWithMarket = new BusinessProcurementEngine(
      worldEngine,
      inventoryManager,
      supplyChainEngine,
      spatialQueryService,
      eventScheduler,
      timeEngine,
      marketEngine
    );
    expect(engineWithMarket.getMarketEngine()).toBe(marketEngine);
  });

  test('Valid B2B procurement routes through MarketEngine and creates ledger records exactly once', () => {
    const marketEngine = new MarketEngine(worldEngine, timeEngine, eventScheduler);
    engine.setMarketEngine(marketEngine);

    const buyerId = 'shop-b2b-buyer';
    const sellerId = 'wholesale-b2b-seller';

    inventoryManager.createInventory(`inv-${buyerId}`, buyerId, 1000);
    inventoryManager.createInventory(`inv-${sellerId}`, sellerId, 2000);
    inventoryManager.addItemQuantity(`inv-${sellerId}`, 'wheat', 500, 'kg');

    const buyerWallet = {
      id: `wallet-${buyerId}`,
      ownerId: buyerId,
      balance: 10000,
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

    worldEngine.workplaceRepository.create({
      id: buyerId,
      type: WorkplaceType.SHOP,
      regionId: 'reg-1',
      locationId: 'loc-1',
      capacity: 10,
      occupiedPositions: 0,
      vacancies: 10,
      positions: [],
      inventoryId: `inv-${buyerId}`,
      storageCapacity: 1000,
      wallet: buyerWallet,
      inventoryConfiguration: {
        'wheat': { reorderPoint: 50, targetStock: 200 }
      }
    });

    worldEngine.workplaceRepository.create({
      id: sellerId,
      type: WorkplaceType.WHOLESALE,
      regionId: 'reg-1',
      locationId: 'loc-2',
      capacity: 10,
      occupiedPositions: 0,
      vacancies: 10,
      positions: [],
      inventoryId: `inv-${sellerId}`,
      storageCapacity: 2000,
      wallet: sellerWallet
    });

    jest.spyOn(spatialQueryService, 'calculateRoute').mockReturnValue({ distance: 5 } as any);

    // Spy on marketEngine.processTransaction
    const processTransactionSpy = jest.spyOn(marketEngine, 'processTransaction');

    engine.runProcurementCycle();

    // Verify MarketEngine was called
    expect(processTransactionSpy).toHaveBeenCalled();

    // Verify ledger transactions
    const buyerTxs = marketEngine.getTransactionsByEntity(buyerId);
    expect(buyerTxs.length).toBeGreaterThanOrEqual(1);

    const mainPurchaseTx = buyerTxs.find(t => t.sellerId === sellerId);
    expect(mainPurchaseTx).toBeDefined();
    expect(mainPurchaseTx!.productId).toBe('wheat');
    expect(mainPurchaseTx!.quantity).toBe(200);
    expect(mainPurchaseTx!.transactionType).toBe('RETAIL_PROCUREMENT');
    expect(mainPurchaseTx!.totalPrice).toBeGreaterThan(0);

    // Exactly one purchase transaction from seller to buyer recorded
    const directPurchases = buyerTxs.filter(t => t.sellerId === sellerId && t.productId === 'wheat');
    expect(directPurchases.length).toBe(1);

    // Wallets correctly updated through MarketEngine
    expect(buyerWallet.totalExpenses).toBeGreaterThan(0);
    expect(sellerWallet.totalIncome).toBe(mainPurchaseTx!.totalPrice);
    expect(sellerWallet.balance).toBe(1000 + mainPurchaseTx!.totalPrice);

    // Order created in supply chain
    const orders = supplyChainEngine.getOrdersForBusiness(buyerId);
    expect(orders.length).toBe(1);
    expect(orders[0].quantity).toBe(200);
  });

  test('Invalid B2B procurement with insufficient funds is rejected without creating ledger records', () => {
    const marketEngine = new MarketEngine(worldEngine, timeEngine, eventScheduler);
    engine.setMarketEngine(marketEngine);

    const buyerId = 'shop-broke-buyer';
    const sellerId = 'wholesale-wealthy-seller';

    inventoryManager.createInventory(`inv-${buyerId}`, buyerId, 1000);
    inventoryManager.createInventory(`inv-${sellerId}`, sellerId, 2000);
    inventoryManager.addItemQuantity(`inv-${sellerId}`, 'wheat', 500, 'kg');

    const buyerWallet = {
      id: `wallet-${buyerId}`,
      ownerId: buyerId,
      balance: 1, // Only 1 GEN, cannot afford 200 kg wheat at ~8-10 GEN/kg
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

    worldEngine.workplaceRepository.create({
      id: buyerId,
      type: WorkplaceType.SHOP,
      regionId: 'reg-1',
      locationId: 'loc-1',
      capacity: 10,
      occupiedPositions: 0,
      vacancies: 10,
      positions: [],
      inventoryId: `inv-${buyerId}`,
      storageCapacity: 1000,
      wallet: buyerWallet,
      inventoryConfiguration: {
        'wheat': { reorderPoint: 50, targetStock: 200 }
      }
    });

    worldEngine.workplaceRepository.create({
      id: sellerId,
      type: WorkplaceType.WHOLESALE,
      regionId: 'reg-1',
      locationId: 'loc-2',
      capacity: 10,
      occupiedPositions: 0,
      vacancies: 10,
      positions: [],
      inventoryId: `inv-${sellerId}`,
      storageCapacity: 2000,
      wallet: sellerWallet
    });

    jest.spyOn(spatialQueryService, 'calculateRoute').mockReturnValue({ distance: 5 } as any);

    engine.runProcurementCycle();

    // No transactions should be created
    const buyerTxs = marketEngine.getTransactionsByEntity(buyerId);
    expect(buyerTxs.length).toBe(0);

    // Wallets should not be mutated
    expect(buyerWallet.balance).toBe(1);
    expect(buyerWallet.totalExpenses).toBe(0);
    expect(sellerWallet.balance).toBe(1000);
    expect(sellerWallet.totalIncome).toBe(0);

    // No supply chain order created
    const orders = supplyChainEngine.getOrdersForBusiness(buyerId);
    expect(orders.length).toBe(0);
  });
});


