import { SupplyChainEngine } from '../SupplyChainEngine';
import { WorldEngine } from '../../world/WorldEngine';
import { EventScheduler } from '../../events/EventScheduler';
import { TimeEngine } from '../../time/TimeEngine';
import { InventoryManager } from '../../inventory/InventoryManager';
import { SpatialQueryService } from '../../spatial/SpatialQueryService';
import { SpatialEngine } from '../../spatial/SpatialEngine';
import { OrderStatus, ShipmentStatus, Workplace, WorkplaceType } from '@genesis/shared';

describe('SupplyChainEngine', () => {
  let worldEngine: WorldEngine;
  let eventScheduler: EventScheduler;
  let timeEngine: TimeEngine;
  let inventoryManager: InventoryManager;
  let spatialEngine: SpatialEngine;
  let supplyChainEngine: SupplyChainEngine;

  beforeEach(() => {
    worldEngine = new WorldEngine();
    timeEngine = new TimeEngine();
    eventScheduler = new EventScheduler(timeEngine);
    inventoryManager = new InventoryManager();
    spatialEngine = new SpatialEngine(worldEngine, eventScheduler);
    
    supplyChainEngine = new SupplyChainEngine(
      worldEngine,
      eventScheduler,
      timeEngine,
      inventoryManager,
      spatialEngine.queryService
    );

    jest.spyOn(worldEngine, 'getEntityCoordinates').mockReturnValue({ x: 0, y: 0 });

    // Setup farm
    const farm: Workplace = {
      id: 'farm-1',
      type: WorkplaceType.FARM,
      locationId: 'loc-1',
      regionId: 'reg-1',
      capacity: 10,
      occupiedPositions: 10,
      vacancies: 0,
      positions: [],
      inventoryId: 'inv-farm'
    };
    worldEngine.workplaceRepository.create(farm);
    inventoryManager.createInventory('inv-farm', 'farm-1', 1000);
    inventoryManager.addItemQuantity('inv-farm', 'wheat', 500, 'kg');

    // Setup wholesale
    const wholesale: Workplace = {
      id: 'wholesale-1',
      type: WorkplaceType.WHOLESALE,
      locationId: 'loc-2',
      regionId: 'reg-1',
      capacity: 10,
      occupiedPositions: 10,
      vacancies: 0,
      positions: [],
      inventoryId: 'inv-wholesale'
    };
    worldEngine.workplaceRepository.create(wholesale);
    inventoryManager.createInventory('inv-wholesale', 'wholesale-1', 5000);
  });

  test('should create order and dispatch shipment', () => {
    const order = supplyChainEngine.createOrder('wholesale-1', 'farm-1', 'wheat', 200, 'kg');
    
    expect(order.status).toBe(OrderStatus.DISPATCHED);
    expect(order.shipmentId).toBeDefined();

    const shipment = supplyChainEngine.getShipment(order.shipmentId!);
    expect(shipment).toBeDefined();
    expect(shipment!.status).toBe(ShipmentStatus.IN_TRANSIT);

    // Seller inventory should have deducted the amount completely since it's in transit
    const farmInv = inventoryManager.getInventory('inv-farm')!;
    expect(farmInv.items['wheat'].totalQuantity).toBe(300); // 500 - 200
  });

  test('should fail order if seller does not have enough stock', () => {
    const order = supplyChainEngine.createOrder('wholesale-1', 'farm-1', 'wheat', 600, 'kg');
    
    expect(order.status).toBe(OrderStatus.FAILED);
    expect(order.shipmentId).toBeUndefined();

    const farmInv = inventoryManager.getInventory('inv-farm')!;
    expect(farmInv.items['wheat'].totalQuantity).toBe(500); // Unchanged
  });
});
