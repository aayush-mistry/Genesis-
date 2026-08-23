import { CommerceAutomation } from '../CommerceAutomation';
import { WorldEngine } from '../../world/WorldEngine';
import { SupplyChainEngine } from '../SupplyChainEngine';
import { InventoryManager } from '../../inventory/InventoryManager';
import { SpatialQueryService } from '../../spatial/SpatialQueryService';
import { EventScheduler } from '../../events/EventScheduler';
import { TimeEngine } from '../../time/TimeEngine';
import { Workplace, WorkplaceType } from '@genesis/shared';

describe('CommerceAutomation', () => {
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
  });

  test('should generate orders for retail from wholesale (Normal Scenario)', async () => {
    // Setup Wholesale
    const wholesale: Workplace = {
      id: 'wholesale-1',
      type: WorkplaceType.WHOLESALE,
      locationId: 'loc-1',
      regionId: 'reg-1',
      capacity: 20,
      occupiedPositions: 20,
      vacancies: 0,
      positions: [],
      inventoryId: 'inv-wholesale'
    };
    worldEngine.workplaceRepository.create(wholesale);
    inventoryManager.createInventory('inv-wholesale', 'wholesale-1', 50000);
    inventoryManager.addItemQuantity('inv-wholesale', 'wheat', 2000, 'kg'); // Wholesale has 2000 wheat

    // Setup Retail
    const shop: Workplace = {
      id: 'shop-1',
      type: WorkplaceType.SHOP,
      locationId: 'loc-1',
      regionId: 'reg-1',
      capacity: 10,
      occupiedPositions: 10,
      vacancies: 0,
      positions: [],
      inventoryId: 'inv-shop',
      metadata: { storeType: 'DEFAULT' }
    };
    worldEngine.workplaceRepository.create(shop);
    inventoryManager.createInventory('inv-shop', 'shop-1', 5000);
    // Shop has 0 wheat, target stock is 10 * 50 = 500

    commerceAutomation.initialize();
    
    // Trigger commerce cycle
    (commerceAutomation as any).runCommerceCycle();

    // Check if order was created for shop
    const shopOrders = supplyChainEngine.getOrdersForBusiness('shop-1');
    const wheatOrder = shopOrders.find(o => o.productId === 'wheat');
    expect(wheatOrder).toBeDefined();
    expect(wheatOrder!.quantity).toBe(500); // Should order 500 wheat from wholesale
    expect(wheatOrder!.sellerId).toBe('wholesale-1');
    expect(wheatOrder!.status).toBe('DISPATCHED'); // Has enough, gets dispatched
  });

  test('should fallback to Producer when Wholesale lacks inventory', async () => {
    // Setup Farm (Producer)
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
    inventoryManager.createInventory('inv-farm', 'farm-1', 10000);
    inventoryManager.addItemQuantity('inv-farm', 'wheat', 5000, 'kg'); // Farm has 5000 wheat

    // Setup Wholesale (Not enough)
    const wholesale: Workplace = {
      id: 'wholesale-1',
      type: WorkplaceType.WHOLESALE,
      locationId: 'loc-1',
      regionId: 'reg-1',
      capacity: 20,
      occupiedPositions: 20,
      vacancies: 0,
      positions: [],
      inventoryId: 'inv-wholesale'
    };
    worldEngine.workplaceRepository.create(wholesale);
    inventoryManager.createInventory('inv-wholesale', 'wholesale-1', 50000);
    inventoryManager.addItemQuantity('inv-wholesale', 'wheat', 100, 'kg'); // Wholesale only has 100 wheat

    // Setup Retail
    const shop: Workplace = {
      id: 'shop-1',
      type: WorkplaceType.SHOP,
      locationId: 'loc-1',
      regionId: 'reg-1',
      capacity: 10,
      occupiedPositions: 10,
      vacancies: 0,
      positions: [],
      inventoryId: 'inv-shop'
    };
    worldEngine.workplaceRepository.create(shop);
    inventoryManager.createInventory('inv-shop', 'shop-1', 5000);
    // Needs 500 wheat

    commerceAutomation.initialize();
    
    // Trigger commerce cycle
    (commerceAutomation as any).runCommerceCycle();

    // Check Retail order
    const shopOrders = supplyChainEngine.getOrdersForBusiness('shop-1');
    const wheatOrder = shopOrders.find(o => o.productId === 'wheat');
    expect(wheatOrder).toBeDefined();
    expect(wheatOrder!.quantity).toBe(500); 
    expect(wheatOrder!.sellerId).toBe('wholesale-1');
    console.log('Wheat Order Status:', wheatOrder!.status);
    expect(wheatOrder!.status).toBe('PENDING'); // Not enough, stays pending

    // Check Wholesale upstream order
    const wholesaleOrders = supplyChainEngine.getOrdersForBusiness('wholesale-1');
    // 1 pending order from retail (wheat), 1 created order to farm (wheat)
    // Plus raw_fish orders (1 retail -> wholesale, 0 to farm because no farm has raw_fish)
    const buyOrder = wholesaleOrders.find(o => o.sellerId === 'farm-1' && o.productId === 'wheat');
    expect(buyOrder).toBeDefined();
    // Wholesale should order the remaining amount: 500 - 100 = 400
    expect(buyOrder!.quantity).toBe(400); 
  });

  test('should keep requirement pending if no supplier can fulfill', async () => {
    // Setup Wholesale (Not enough)
    const wholesale: Workplace = {
      id: 'wholesale-2',
      type: WorkplaceType.WHOLESALE,
      locationId: 'loc-1',
      regionId: 'reg-1',
      capacity: 20,
      occupiedPositions: 20,
      vacancies: 0,
      positions: [],
      inventoryId: 'inv-wholesale-2'
    };
    worldEngine.workplaceRepository.create(wholesale);
    inventoryManager.createInventory('inv-wholesale-2', 'wholesale-2', 50000);
    inventoryManager.addItemQuantity('inv-wholesale-2', 'wheat', 200, 'kg'); 

    // Setup Retail
    const shop: Workplace = {
      id: 'shop-2',
      type: WorkplaceType.SHOP,
      locationId: 'loc-1',
      regionId: 'reg-1',
      capacity: 10,
      occupiedPositions: 10,
      vacancies: 0,
      positions: [],
      inventoryId: 'inv-shop-2',
      metadata: { storeType: 'DEFAULT' }
    };
    worldEngine.workplaceRepository.create(shop);
    inventoryManager.createInventory('inv-shop-2', 'shop-2', 5000);
    // Needs 500 wheat

    commerceAutomation.initialize();
    (commerceAutomation as any).runCommerceCycle();

    const shopOrders = supplyChainEngine.getOrdersForBusiness('shop-2');
    const wheatOrder = shopOrders.find(o => o.productId === 'wheat');
    expect(wheatOrder).toBeDefined();
    expect(wheatOrder!.status).toBe('PENDING'); // Not enough, stays pending

    // Wholesale tries to order 300 from Producers, but there are no producers!
    const wholesaleOrders = supplyChainEngine.getOrdersForBusiness('wholesale-2');
    const wholesaleWheatBuyOrder = wholesaleOrders.find(o => o.buyerId === 'wholesale-2' && o.productId === 'wheat');
    // It should not exist because the producer search fails
    expect(wholesaleWheatBuyOrder).toBeUndefined(); 
  });
});
