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
      unit: 'kg',
      baseYieldPerArea: 50,
      resourceRequirements: [
        { resourceId: 'IRON', amountPerOutputUnit: 1 }
      ],
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
      positions: Array.from({ length: 5 }).map(() => ({ occupantId: 'c1' })) as any[],
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
      positions: Array.from({ length: 20 }).map(() => ({ occupantId: 'c1' })) as any[],
      inventoryId: 'inv-mine'
    };
    worldEngine.workplaceRepository.create(mine);
    inventoryManager.createInventory('inv-mine', 'mine-1', 5000);
    
    // Mock the resource manager to return iron
    jest.spyOn(resourceEngine.resourceManager, 'getResourcesByRegion').mockReturnValue([{
      id: 'res-iron',
      type: 'IRON' as any,
      name: 'Iron Deposit',
      category: 'NON_RENEWABLE' as any,
      unit: 'kg',
      renewable: false,
      regionId: 'reg-1',
      currentAmount: 1000,
      maximumAmount: 1000,
      naturalRecoveryRate: null,
      consumptionRate: null,
      condition: null,
      extractionDifficulty: 0,
      coordinates: { x: 0, y: 0 },
      radius: 100,
      createdAt: new Date(),
      updatedAt: new Date()
    }]);

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
    
    // Mock the resource manager to return 0 iron
    jest.spyOn(resourceEngine.resourceManager, 'getResourcesByRegion').mockReturnValue([]);

    productionEngine.initialize();
    (productionEngine as any).runProductionCycle();
    await new Promise(resolve => setTimeout(resolve, 50));

    const inv = inventoryManager.getInventory('inv-mine-2')!;
    expect(inv.items['iron_ore']).toBeUndefined();
  });

  test('should produce 0 wheat in Winter due to seasonal dormancy', async () => {
    // Set time to Winter (month 12)
    jest.spyOn(timeEngine, 'getCurrentTime').mockReturnValue({
      year: 1,
      month: 12,
      day: 15,
      hour: 12,
      minute: 0,
      second: 0
    });

    const farm: Workplace = {
      id: 'winter-farm',
      type: WorkplaceType.FARM,
      locationId: 'loc-1',
      regionId: 'reg-winter',
      capacity: 10,
      occupiedPositions: 10,
      vacancies: 0,
      positions: Array.from({ length: 10 }).map(() => ({ occupantId: 'c1' })) as any[],
      inventoryId: 'inv-winter-farm'
    };
    worldEngine.workplaceRepository.create(farm);
    inventoryManager.createInventory('inv-winter-farm', 'winter-farm', 5000);

    const completedEvents: any[] = [];
    eventScheduler.emitter.on('ProductionCompleted', (e) => completedEvents.push(e));

    (productionEngine as any).runProductionCycle();
    await new Promise(resolve => setTimeout(resolve, 50));

    const inv = inventoryManager.getInventory('inv-winter-farm')!;
    expect(inv.items['wheat']).toBeUndefined();
    expect(completedEvents.filter(e => e.producerId === 'winter-farm')).toHaveLength(0);

    const report = productionEngine.getCropYieldReport('winter-farm');
    expect(report).toBeDefined();
    expect(report?.season).toBe('Winter');
    expect(report?.seasonFactor).toBe(0.0);
    expect(report?.status).toBe('DORMANT_UNSUITABLE');
  });

  test('should reduce wheat yield under adverse weather (Storm)', async () => {
    jest.spyOn(timeEngine, 'getCurrentTime').mockReturnValue({
      year: 1,
      month: 4, // Summer
      day: 10,
      hour: 12,
      minute: 0,
      second: 0
    });

    // Mock environment engine with Storm
    const mockEnvEngine = {
      seasonManager: { getCurrentSeason: () => 'Summer' },
      weatherManager: { getRegionWeather: () => ({ currentType: 'Storm' }) },
      getEnvironmentalState: () => ({ temperature: 22 })
    } as any;
    productionEngine.setEnvironmentEngine(mockEnvEngine);

    const farm: Workplace = {
      id: 'storm-farm',
      type: WorkplaceType.FARM,
      locationId: 'loc-1',
      regionId: 'reg-storm',
      capacity: 10,
      occupiedPositions: 10,
      vacancies: 0,
      positions: Array.from({ length: 10 }).map(() => ({ occupantId: 'c1' })) as any[],
      inventoryId: 'inv-storm-farm'
    };
    worldEngine.workplaceRepository.create(farm);
    inventoryManager.createInventory('inv-storm-farm', 'storm-farm', 5000);

    // Provide ample water
    jest.spyOn(resourceEngine.resourceManager, 'getResourcesByRegion').mockReturnValue([{
      id: 'res-water',
      type: 'WATER' as any,
      name: 'River',
      category: 'RENEWABLE' as any,
      unit: 'L',
      renewable: true,
      regionId: 'reg-storm',
      currentAmount: 100000,
      maximumAmount: 100000,
      naturalRecoveryRate: 1000,
      consumptionRate: 0,
      condition: null,
      extractionDifficulty: 0,
      coordinates: { x: 0, y: 0 },
      radius: 100,
      createdAt: new Date(),
      updatedAt: new Date()
    }]);

    (productionEngine as any).runProductionCycle();
    await new Promise(resolve => setTimeout(resolve, 50));

    const inv = inventoryManager.getInventory('inv-storm-farm')!;
    // Base capacity 1000 * worker efficiency 1.0 = 1000
    // Storm multiplier = 0.5 -> 500
    expect(inv.items['wheat'].totalQuantity).toBe(500);

    const report = productionEngine.getCropYieldReport('storm-farm');
    expect(report?.weather).toBe('Storm');
    expect(report?.weatherFactor).toBe(0.5);
    expect(report?.status).toBe('REDUCED_YIELD');
  });
});

