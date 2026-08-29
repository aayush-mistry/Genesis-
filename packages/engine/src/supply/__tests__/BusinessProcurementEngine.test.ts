import { BusinessProcurementEngine } from '../BusinessProcurementEngine';
import { WorldEngine } from '../../world/WorldEngine';
import { InventoryManager } from '../../inventory/InventoryManager';
import { SupplyChainEngine } from '../SupplyChainEngine';
import { EventScheduler } from '../../events/EventScheduler';
import { TimeEngine } from '../../time/TimeEngine';
import { SpatialQueryService } from '../../spatial/SpatialQueryService';
import { GridSpatialIndex } from '../../spatial/GridSpatialIndex';
import { WorkplaceType, OrderStatus } from '@genesis/shared';

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
});
