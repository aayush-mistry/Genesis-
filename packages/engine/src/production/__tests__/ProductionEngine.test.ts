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

  test('should accurately convert m³ water units to Litres and limit crop yield accordingly', async () => {
    const farm: Workplace = {
      id: 'farm-m3',
      type: WorkplaceType.FARM,
      locationId: 'loc-1',
      regionId: 'reg-m3',
      capacity: 10,
      occupiedPositions: 10,
      vacancies: 0,
      positions: Array.from({ length: 10 }).map(() => ({ occupantId: 'c1' })) as any[],
      inventoryId: 'inv-farm-m3'
    };
    worldEngine.workplaceRepository.create(farm);
    inventoryManager.createInventory('inv-farm-m3', 'farm-m3', 5000);

    // Provide 10 m³ of water = 10,000 Litres
    // Base capacity = 1000 kg. Wheat requires 20 L/kg. Needed = 20,000 L.
    // Available 10,000 L supports 500 kg max.
    const waterRes = resourceEngine.resourceManager.addResource({
      type: 'WATER' as any,
      name: 'Reservoir',
      category: 'RENEWABLE' as any,
      unit: 'm³',
      renewable: true,
      regionId: 'reg-m3',
      currentAmount: 10,
      maximumAmount: 100,
      naturalRecoveryRate: 0,
      consumptionRate: 0,
      condition: null,
      extractionDifficulty: 0,
      coordinates: { x: 0, y: 0 },
      radius: 100
    });

    productionEngine.runProductionCycle('m3-water-cycle');

    const inv = inventoryManager.getInventory('inv-farm-m3')!;
    expect(inv.items['wheat'].totalQuantity).toBe(500);

    // Water consumed = 500 kg * 20 L/kg = 10,000 L = 10 m³
    const updatedWater = resourceEngine.resourceManager.getResourceById('reg-m3', waterRes.id)!;
    expect(updatedWater.currentAmount).toBe(0);
  });

  test('should produce zero yield when authoritative water is depleted (0 L)', async () => {
    const farm: Workplace = {
      id: 'farm-dry',
      type: WorkplaceType.FARM,
      locationId: 'loc-1',
      regionId: 'reg-dry',
      capacity: 10,
      occupiedPositions: 10,
      vacancies: 0,
      positions: Array.from({ length: 10 }).map(() => ({ occupantId: 'c1' })) as any[],
      inventoryId: 'inv-farm-dry'
    };
    worldEngine.workplaceRepository.create(farm);
    inventoryManager.createInventory('inv-farm-dry', 'farm-dry', 5000);

    resourceEngine.resourceManager.addResource({
      type: 'WATER' as any,
      name: 'Dry Well',
      category: 'RENEWABLE' as any,
      unit: 'L',
      renewable: true,
      regionId: 'reg-dry',
      currentAmount: 0,
      maximumAmount: 1000,
      naturalRecoveryRate: 0,
      consumptionRate: 0,
      condition: null,
      extractionDifficulty: 0,
      coordinates: { x: 0, y: 0 },
      radius: 100
    });

    productionEngine.runProductionCycle('dry-cycle');

    const inv = inventoryManager.getInventory('inv-farm-dry')!;
    expect(inv.items['wheat']).toBeUndefined();

    const report = productionEngine.getCropYieldReport('farm-dry');
    expect(report?.waterAvailabilityFactor).toBe(0.0);
    expect(report?.finalYield).toBe(0);
    expect(report?.status).toBe('RESOURCE_CONSTRAINED');
  });

  test('should guarantee exactly-once deduction and prevent duplicate inventory on cycle retry', async () => {
    const farm: Workplace = {
      id: 'farm-idempotent',
      type: WorkplaceType.FARM,
      locationId: 'loc-1',
      regionId: 'reg-idempotent',
      capacity: 10,
      occupiedPositions: 10,
      vacancies: 0,
      positions: Array.from({ length: 10 }).map(() => ({ occupantId: 'c1' })) as any[],
      inventoryId: 'inv-farm-idempotent'
    };
    worldEngine.workplaceRepository.create(farm);
    inventoryManager.createInventory('inv-farm-idempotent', 'farm-idempotent', 5000);

    const waterRes = resourceEngine.resourceManager.addResource({
      type: 'WATER' as any,
      name: 'Idempotency Lake',
      category: 'RENEWABLE' as any,
      unit: 'L',
      renewable: true,
      regionId: 'reg-idempotent',
      currentAmount: 50000,
      maximumAmount: 100000,
      naturalRecoveryRate: 0,
      consumptionRate: 0,
      condition: null,
      extractionDifficulty: 0,
      coordinates: { x: 0, y: 0 },
      radius: 100
    });

    const completionEvents: any[] = [];
    eventScheduler.emitter.on('ProductionCompleted', (e) => completionEvents.push(e));

    const cycleId = 'cycle-idempotency-100';

    // First execution
    productionEngine.runProductionCycle(cycleId);

    const inv = inventoryManager.getInventory('inv-farm-idempotent')!;
    expect(inv.items['wheat'].totalQuantity).toBe(1000); // 1000 kg produced
    expect(resourceEngine.resourceManager.getResourceById('reg-idempotent', waterRes.id)!.currentAmount).toBe(30000); // 50000 - 20000 L consumed
    expect(completionEvents.filter(e => e.producerId === 'farm-idempotent')).toHaveLength(1);

    // Retrying the EXACT same completed cycle
    productionEngine.runProductionCycle(cycleId);

    // Inventory must NOT duplicate
    expect(inv.items['wheat'].totalQuantity).toBe(1000);
    // Water must NOT be deducted again
    expect(resourceEngine.resourceManager.getResourceById('reg-idempotent', waterRes.id)!.currentAmount).toBe(30000);
    // Events must NOT be duplicated
    expect(completionEvents.filter(e => e.producerId === 'farm-idempotent')).toHaveLength(1);
  });

  test('should allow legitimate subsequent production cycles to execute normally', async () => {
    const farm: Workplace = {
      id: 'farm-subsequent',
      type: WorkplaceType.FARM,
      locationId: 'loc-1',
      regionId: 'reg-subsequent',
      capacity: 10,
      occupiedPositions: 10,
      vacancies: 0,
      positions: Array.from({ length: 10 }).map(() => ({ occupantId: 'c1' })) as any[],
      inventoryId: 'inv-farm-subsequent'
    };
    worldEngine.workplaceRepository.create(farm);
    inventoryManager.createInventory('inv-farm-subsequent', 'farm-subsequent', 10000);

    const waterRes = resourceEngine.resourceManager.addResource({
      type: 'WATER' as any,
      name: 'Stream',
      category: 'RENEWABLE' as any,
      unit: 'L',
      renewable: true,
      regionId: 'reg-subsequent',
      currentAmount: 50000,
      maximumAmount: 100000,
      naturalRecoveryRate: 0,
      consumptionRate: 0,
      condition: null,
      extractionDifficulty: 0,
      coordinates: { x: 0, y: 0 },
      radius: 100
    });

    // Cycle 1
    productionEngine.runProductionCycle('cycle-day-1');
    const inv = inventoryManager.getInventory('inv-farm-subsequent')!;
    expect(inv.items['wheat'].totalQuantity).toBe(1000);
    expect(resourceEngine.resourceManager.getResourceById('reg-subsequent', waterRes.id)!.currentAmount).toBe(30000);

    // Cycle 2 (legitimate next day)
    productionEngine.runProductionCycle('cycle-day-2');
    expect(inv.items['wheat'].totalQuantity).toBe(2000);
    expect(resourceEngine.resourceManager.getResourceById('reg-subsequent', waterRes.id)!.currentAmount).toBe(10000);
  });

  test('should recognize hydrated completed cycles after cold restart', async () => {
    const farm: Workplace = {
      id: 'farm-cold-restart',
      type: WorkplaceType.FARM,
      locationId: 'loc-1',
      regionId: 'reg-cold',
      capacity: 10,
      occupiedPositions: 10,
      vacancies: 0,
      positions: Array.from({ length: 10 }).map(() => ({ occupantId: 'c1' })) as any[],
      inventoryId: 'inv-farm-cold'
    };
    worldEngine.workplaceRepository.create(farm);
    inventoryManager.createInventory('inv-farm-cold', 'farm-cold-restart', 5000);

    // Pre-populate inventory from persistent database (already has 1000 kg from previous run)
    inventoryManager.addItemQuantity('inv-farm-cold', 'wheat', 1000, 'kg', 1000);

    // Hydrate completed cycle ID
    productionEngine.recordCompletedCycle('pre-restart-cycle-day-1');

    // Attempt to replay the completed cycle
    productionEngine.runProductionCycle('pre-restart-cycle-day-1');

    const inv = inventoryManager.getInventory('inv-farm-cold')!;
    // Harvest must NOT be duplicated
    expect(inv.items['wheat'].totalQuantity).toBe(1000);
  });

  test('should ensure failed cycle leaves inputs unconsumed and no falsely recorded harvest', async () => {
    const farm: Workplace = {
      id: 'farm-fail-rollback',
      type: WorkplaceType.FARM,
      locationId: 'loc-1',
      regionId: 'reg-fail-rollback',
      capacity: 10,
      occupiedPositions: 10,
      vacancies: 0,
      positions: Array.from({ length: 10 }).map(() => ({ occupantId: 'c1' })) as any[],
      inventoryId: 'inv-fail-rollback'
    };
    worldEngine.workplaceRepository.create(farm);
    // Insufficient storage capacity (5 kg max, while harvest is 1000 kg)
    inventoryManager.createInventory('inv-fail-rollback', 'farm-fail-rollback', 5);

    const waterRes = resourceEngine.resourceManager.addResource({
      type: 'WATER' as any,
      name: 'Rollback Stream',
      category: 'RENEWABLE' as any,
      unit: 'L',
      renewable: true,
      regionId: 'reg-fail-rollback',
      currentAmount: 20000,
      maximumAmount: 20000,
      naturalRecoveryRate: 0,
      consumptionRate: 0,
      condition: null,
      extractionDifficulty: 0,
      coordinates: { x: 0, y: 0 },
      radius: 100
    });

    const completionEvents: any[] = [];
    eventScheduler.emitter.on('ProductionCompleted', (e) => completionEvents.push(e));

    productionEngine.runProductionCycle('fail-cycle-1');

    const inv = inventoryManager.getInventory('inv-fail-rollback')!;
    expect(inv.items['wheat']).toBeUndefined();
    // Water must NOT be deducted
    expect(waterRes.currentAmount).toBe(20000);
    // No completion event
    expect(completionEvents.filter(e => e.producerId === 'farm-fail-rollback')).toHaveLength(0);
  });
});

