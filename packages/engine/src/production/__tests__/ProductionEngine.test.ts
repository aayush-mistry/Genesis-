import { ProductionEngine } from '../ProductionEngine';
import { WorldEngine } from '../../world/WorldEngine';
import { EventScheduler } from '../../events/EventScheduler';
import { TimeEngine } from '../../time/TimeEngine';
import { InventoryManager } from '../../inventory/InventoryManager';
import { ResourceEngine } from '../../resources/ResourceEngine';
import { Workplace, WorkplaceType, Commodity, ProductCategory, ProductionDefinition } from '@genesis/shared';

describe('ProductionEngine', () => {
  let worldEngine: WorldEngine;
  let eventScheduler: EventScheduler;
  let timeEngine: TimeEngine;
  let inventoryManager: InventoryManager;
  let resourceEngine: ResourceEngine;
  let productionEngine: ProductionEngine;

  beforeEach(() => {
    worldEngine = new WorldEngine();
    timeEngine = new TimeEngine();
    eventScheduler = new EventScheduler(timeEngine);
    inventoryManager = new InventoryManager();
    resourceEngine = new ResourceEngine(worldEngine, {} as any, eventScheduler, timeEngine);
    
    productionEngine = new ProductionEngine(
      worldEngine,
      eventScheduler,
      timeEngine,
      inventoryManager,
      resourceEngine
    );

    const wheat: Commodity = {
      id: 'wheat',
      name: 'Wheat',
      category: ProductCategory.FOOD,
      unit: 'kg',
      basePrice: 10,
      isBiological: true
    };
    productionEngine.registerCommodity(wheat);

    const def: ProductionDefinition = {
      productId: 'wheat',
      workplaceType: WorkplaceType.FARM,
      unit: 'kg',
      baseYieldPerArea: 100,
      workersRequiredPerUnitArea: 1
    };
    productionEngine.registerProductionDefinition(def);

    const ironOre: Commodity = {
      id: 'iron_ore',
      name: 'Iron Ore',
      category: ProductCategory.RAW_MATERIAL,
      unit: 'kg',
      basePrice: 50,
      isBiological: false
    };
    productionEngine.registerCommodity(ironOre);
    
    const mineDef: ProductionDefinition = {
      productId: 'iron_ore',
      workplaceType: WorkplaceType.MINE,
      requiredResource: 'iron',
      unit: 'kg',
      baseYieldPerArea: 50,
      workersRequiredPerUnitArea: 2
    };
    productionEngine.registerProductionDefinition(mineDef);
  });

  test('should run production cycle and add to inventory for FARM', async () => {
    const farm: Workplace = {
      id: 'farm-1',
      type: WorkplaceType.FARM,
      locationId: 'loc-1',
      regionId: 'reg-1',
      capacity: 10,
      occupiedPositions: 5, // 50% efficiency
      vacancies: 5,
      positions: [],
      inventoryId: 'inv-farm'
    };
    worldEngine.workplaceRepository.create(farm);
    inventoryManager.createInventory('inv-farm', 'farm-1', 5000);

    productionEngine.initialize();
    
    // Trigger production cycle manually to bypass event scheduler delays in test
    (productionEngine as any).runProductionCycle();
    await new Promise(resolve => setTimeout(resolve, 50)); // let events process

    const inv = inventoryManager.getInventory('inv-farm')!;
    
    // Capacity 10, workers per unit area 1 = 10 units. Yield = 100. Base capacity = 1000.
    // Efficiency = 5/10 = 0.5. Actual = 500.
    expect(inv.items['wheat'].totalQuantity).toBe(500);
  });

  test('should produce iron for MINE if resource exists', async () => {
    const mine: Workplace = {
      id: 'mine-1',
      type: WorkplaceType.MINE,
      locationId: 'loc-1',
      regionId: 'reg-1',
      capacity: 20,
      occupiedPositions: 20, // 100% efficiency
      vacancies: 0,
      positions: [],
      inventoryId: 'inv-mine'
    };
    worldEngine.workplaceRepository.create(mine);
    inventoryManager.createInventory('inv-mine', 'mine-1', 5000);
    
    // Mock the resource engine to return iron
    jest.spyOn(resourceEngine, 'getResourceQuantity').mockReturnValue(1000);

    productionEngine.initialize();
    (productionEngine as any).runProductionCycle();
    await new Promise(resolve => setTimeout(resolve, 50));

    const inv = inventoryManager.getInventory('inv-mine')!;
    
    // Capacity 20, workers per unit area 2 = 10 units. Yield = 50. Base capacity = 500.
    // Efficiency = 1.0. Actual = 500.
    expect(inv.items['iron_ore'].totalQuantity).toBe(500);
  });

  test('should not produce iron for MINE if resource is missing', async () => {
    const mine: Workplace = {
      id: 'mine-2',
      type: WorkplaceType.MINE,
      locationId: 'loc-1',
      regionId: 'reg-1',
      capacity: 20,
      occupiedPositions: 20,
      vacancies: 0,
      positions: [],
      inventoryId: 'inv-mine-2'
    };
    worldEngine.workplaceRepository.create(mine);
    inventoryManager.createInventory('inv-mine-2', 'mine-2', 5000);
    
    // Mock the resource engine to return 0 iron
    jest.spyOn(resourceEngine, 'getResourceQuantity').mockReturnValue(0);

    productionEngine.initialize();
    (productionEngine as any).runProductionCycle();
    await new Promise(resolve => setTimeout(resolve, 50));

    const inv = inventoryManager.getInventory('inv-mine-2')!;
    expect(inv.items['iron_ore']).toBeUndefined();
  });
});
