import { CommerceAutomation } from '../CommerceAutomation';
import { WorldEngine } from '../../world/WorldEngine';
import { SupplyChainEngine } from '../SupplyChainEngine';
import { InventoryManager } from '../../inventory/InventoryManager';
import { SpatialQueryService } from '../../spatial/SpatialQueryService';
import { EventScheduler } from '../../events/EventScheduler';
import { TimeEngine } from '../../time/TimeEngine';
import { Workplace, WorkplaceType } from '@genesis/shared';

describe('SupplyChainIntegration (Phase 6.3)', () => {
  let worldEngine: WorldEngine;
  let inventoryManager: InventoryManager;
  let timeEngine: TimeEngine;
  let eventScheduler: EventScheduler;
  let spatialQueryService: SpatialQueryService;
  let supplyChainEngine: SupplyChainEngine;
  let commerceAutomation: CommerceAutomation;

  beforeEach(() => {
    worldEngine = new WorldEngine();
    timeEngine = new TimeEngine();
    eventScheduler = new EventScheduler(timeEngine);
    inventoryManager = new InventoryManager();
    spatialQueryService = new SpatialQueryService({} as any, worldEngine);
    
    supplyChainEngine = new SupplyChainEngine(
      worldEngine,
      eventScheduler,
      timeEngine,
      inventoryManager,
      spatialQueryService
    );
    
    // Mock calculateRoute to avoid needing a full location grid in the test
    jest.spyOn(spatialQueryService, 'calculateRoute').mockReturnValue({ path: [], distance: 10 });
    
    commerceAutomation = new CommerceAutomation(
      worldEngine,
      supplyChainEngine,
      inventoryManager,
      spatialQueryService,
      eventScheduler,
      timeEngine
    );

    commerceAutomation.initialize();
  });

  const setupWorkplace = (id: string, type: WorkplaceType, capacity: number, regionId: string) => {
    const wp: Workplace = {
      id,
      type,
      locationId: `loc-${id}`,
      regionId,
      capacity,
      occupiedPositions: 0,
      vacancies: capacity,
      positions: [],
      inventoryId: `inv-${id}`
    };
    worldEngine.workplaceRepository.create(wp);
    inventoryManager.createInventory(`inv-${id}`, id, capacity * 100);
    return wp;
  };

  test('End-to-End Simulation Test: Retail -> Wholesale -> Retail', async () => {
    // 1. Setup World
    const retail = setupWorkplace('retail-1', WorkplaceType.SHOP, 10, 'region-a');
    retail.metadata = { storeType: 'GROCERY' }; // Multiplier 100, needs wheat & raw_fish
    
    const wholesale1 = setupWorkplace('wholesale-1', WorkplaceType.WHOLESALE, 20, 'region-a');
    const wholesale2 = setupWorkplace('wholesale-2', WorkplaceType.WHOLESALE, 20, 'region-a');
    
    // 2. Give wholesale sufficient stock
    inventoryManager.addItemQuantity(wholesale1.inventoryId!, 'wheat', 2000, 'kg');
    inventoryManager.addItemQuantity(wholesale2.inventoryId!, 'wheat', 2000, 'kg');

    // 3. Advance simulation by one day to trigger Daily Commerce Cycle
    // Target stock for retail: 10 capacity * 100 multiplier = 1000.
    // Threshold is 30% (300). Current is 0.
    // Should order 1000 wheat.
    
    timeEngine.advance(86400); // 1 Day in seconds
    await eventScheduler.executeDueEvents(timeEngine.getCurrentTime());

    // Verify order was created
    const orders = supplyChainEngine.getOrdersForBusiness(retail.id);
    expect(orders.length).toBeGreaterThan(0);
    const wheatOrder = orders.find(o => o.productId === 'wheat');
    expect(wheatOrder).toBeDefined();
    expect(wheatOrder!.quantity).toBe(1000);
    expect(wheatOrder!.sellerId).toBe(wholesale1.id); // Or wholesale2, both are valid and same region. Deterministic tie-breaker should pick wholesale-1.

    // Verify wholesale inventory is consumed
    const wInv = inventoryManager.getInventory(wholesale1.inventoryId!);
    expect(wInv!.items['wheat'].reservedQuantity).toBe(0); // already consumed for shipment
    expect(wInv!.items['wheat'].totalQuantity).toBe(1000); // 2000 - 1000 consumed
    expect(wInv!.items['wheat'].availableQuantity).toBe(1000); // 1000

    // Verify shipment created
    const shipments = supplyChainEngine.getAllActiveShipments();
    expect(shipments.length).toBeGreaterThan(0);
    const shipment = shipments.find(s => s.shipmentId === wheatOrder!.shipmentId);
    expect(shipment).toBeDefined();

    // 4. Advance time to shipment arrival
    const travelTime = (10 / SupplyChainEngine.TRUCK_SPEED_UNITS_PER_HOUR) * 3600;
    timeEngine.advance(travelTime + 1);
    await eventScheduler.executeDueEvents(timeEngine.getCurrentTime());

    // Verify retail received inventory
    const rInv = inventoryManager.getInventory(retail.inventoryId!);
    expect(rInv!.items['wheat'].totalQuantity).toBe(1000);
    expect(rInv!.items['wheat'].availableQuantity).toBe(1000);
    
    // Verify wholesale total remains decreased
    expect(wInv!.items['wheat'].totalQuantity).toBe(1000); 

    // 5. Advance another day
    timeEngine.advance(86400);
    await eventScheduler.executeDueEvents(timeEngine.getCurrentTime());

    // Verify NO duplicate order is created
    const ordersAfter = supplyChainEngine.getOrdersForBusiness(retail.id).filter(o => o.productId === 'wheat');
    expect(ordersAfter.length).toBe(1); // Still only the first order
  });

  test('Wholesale-to-Producer Test: Retail -> Wholesale -> Producer Fallback', async () => {
    // Retail needs 500 wheat (target 1000, has 200)
    const retail = setupWorkplace('retail-1', WorkplaceType.SHOP, 10, 'region-a');
    retail.metadata = { storeType: 'GROCERY' };
    inventoryManager.addItemQuantity(retail.inventoryId!, 'wheat', 200, 'kg'); // Need 800
    
    // Wholesale has 100 wheat (Insufficient)
    const wholesale = setupWorkplace('wholesale-1', WorkplaceType.WHOLESALE, 20, 'region-a');
    inventoryManager.addItemQuantity(wholesale.inventoryId!, 'wheat', 100, 'kg');

    // Farm has 1000 wheat
    const farm = setupWorkplace('farm-1', WorkplaceType.FARM, 10, 'region-a');
    inventoryManager.addItemQuantity(farm.inventoryId!, 'wheat', 1000, 'kg');

    // Trigger daily cycle
    timeEngine.advance(86400);
    await eventScheduler.executeDueEvents(timeEngine.getCurrentTime());

    // 1. Retail orders from Wholesale
    const retailOrders = supplyChainEngine.getOrdersForBusiness(retail.id);
    const retailWheatOrder = retailOrders.find(o => o.productId === 'wheat' && o.buyerId === retail.id);
    expect(retailWheatOrder).toBeDefined();
    expect(retailWheatOrder!.sellerId).toBe(wholesale.id);
    expect(retailWheatOrder!.quantity).toBe(800); // 1000 target - 200 current

    // Because Wholesale had insufficient stock, the retail order stays pending
    expect(retailWheatOrder!.status).toBe('PENDING');

    // 2. Wholesale searches producer and creates supplier order
    const wholesaleOrders = supplyChainEngine.getOrdersForBusiness(wholesale.id);
    const wholesaleWheatOrder = wholesaleOrders.find(o => o.productId === 'wheat' && o.buyerId === wholesale.id);
    expect(wholesaleWheatOrder).toBeDefined();
    expect(wholesaleWheatOrder!.sellerId).toBe(farm.id);
    expect(wholesaleWheatOrder!.quantity).toBe(700); // needs 800 - has 100 = 700

    // Verify Farm inventory is consumed for shipment
    const fInv = inventoryManager.getInventory(farm.inventoryId!);
    expect(fInv!.items['wheat'].reservedQuantity).toBe(0); // already consumed for shipment
    expect(fInv!.items['wheat'].totalQuantity).toBe(300); // 1000 - 700

    // Verify Shipment from Farm to Wholesale
    const shipmentFarmToWholesale = supplyChainEngine.getShipment(wholesaleWheatOrder!.shipmentId!);
    expect(shipmentFarmToWholesale).toBeDefined();

    // 3. Shipment arrives at Wholesale
    const travelTime = (10 / SupplyChainEngine.TRUCK_SPEED_UNITS_PER_HOUR) * 3600;
    timeEngine.advance(travelTime + 1);
    await eventScheduler.executeDueEvents(timeEngine.getCurrentTime());

    // Verify Wholesale received wheat and immediately dispatches to Retail
    const wInv = inventoryManager.getInventory(wholesale.inventoryId!);
    // Total was 100 (initial) + 700 (arrived) = 800. Wholesale instantly consumed 800 to dispatch!
    expect(wInv!.items['wheat']).toBeUndefined(); 

    const shipmentWholesaleToRetail = supplyChainEngine.getShipment(retailWheatOrder!.shipmentId!);
    expect(shipmentWholesaleToRetail).toBeDefined();

    // 4. Shipment arrives at Retail
    timeEngine.advance(travelTime + 1);
    await eventScheduler.executeDueEvents(timeEngine.getCurrentTime());

    // Verify Retail received wheat
    const rInv = inventoryManager.getInventory(retail.inventoryId!);
    expect(rInv!.items['wheat'].totalQuantity).toBe(1000);
  });

  test('Failure Test: No Fake Goods', async () => {
    // Retail requires 1000 wheat
    const retail = setupWorkplace('retail-1', WorkplaceType.SHOP, 10, 'region-a');
    retail.metadata = { storeType: 'GROCERY' };
    
    // Wholesales have insufficient/no stock
    const wholesale1 = setupWorkplace('wholesale-1', WorkplaceType.WHOLESALE, 20, 'region-a');
    inventoryManager.addItemQuantity(wholesale1.inventoryId!, 'wheat', 200, 'kg');
    
    const wholesale2 = setupWorkplace('wholesale-2', WorkplaceType.WHOLESALE, 20, 'region-a');
    // 0 wheat

    // Producer has 0 wheat
    const farm = setupWorkplace('farm-1', WorkplaceType.FARM, 10, 'region-a');

    // Trigger daily cycle
    timeEngine.advance(86400);
    await eventScheduler.executeDueEvents(timeEngine.getCurrentTime());

    const retailOrders = supplyChainEngine.getOrdersForBusiness(retail.id);
    const rOrder = retailOrders.find(o => o.productId === 'wheat' && o.buyerId === retail.id);
    
    expect(rOrder).toBeDefined();
    expect(rOrder!.status).toBe('PENDING'); // No supplier could fulfill, remains pending

    // Next cycle
    timeEngine.advance(86400);
    await eventScheduler.executeDueEvents(timeEngine.getCurrentTime());

    // No duplicate orders
    const duplicateOrders = supplyChainEngine.getOrdersForBusiness(retail.id).filter(o => o.productId === 'wheat' && o.buyerId === retail.id);
    expect(duplicateOrders.length).toBe(1);
    
    // No active shipments
    const shipments = supplyChainEngine.getAllActiveShipments();
    expect(shipments.length).toBe(0);
  });
});
