import { supplyService } from '../supply.service';
import { worldService } from '../world.service';
import { timeService } from '../time.service';
import { resourceService } from '../resource.service';
import { environmentService } from '../environment.service';
import { persistenceService } from '../persistence.service';
import { prisma } from '../../repositories/prisma';
import { 
  Workplace, 
  WorkplaceType, 
  ResourceType, 
  ResourceCategory 
} from '@genesis/shared';

describe('T8.4 — Resource Regeneration & Agricultural Sustainability Integration Tests', () => {
  jest.setTimeout(30000);

  beforeAll(async () => {
    await prisma.simulationEvent.deleteMany();
    await prisma.transactionRecord.deleteMany();
    await prisma.consumptionRecord.deleteMany();
    await prisma.inventoryItem.deleteMany();
    await prisma.inventory.deleteMany();
    await prisma.workplace.deleteMany();
    await prisma.resource.deleteMany();
    await prisma.region.deleteMany();
    await prisma.world.deleteMany();
  });

  afterAll(async () => {
    await prisma.simulationEvent.deleteMany();
    await prisma.transactionRecord.deleteMany();
    await prisma.consumptionRecord.deleteMany();
    await prisma.inventoryItem.deleteMany();
    await prisma.inventory.deleteMany();
    await prisma.workplace.deleteMany();
    await prisma.resource.deleteMany();
    await prisma.region.deleteMany();
    await prisma.world.deleteMany();
    await prisma.$disconnect();
  });

  beforeEach(() => {
    worldService.engine.reset();
    resourceService.reset();
    supplyService.reset();
  });

  test('1. Agricultural Yield Starvation and Natural Recovery: Water depletion halts harvest, natural regeneration restores harvest organically', async () => {
    const regionId = 'reg-sustainability-1';

    // 1. Setup Farm Workplace
    const farm: Workplace = {
      id: 'farm-sustainability-1',
      name: 'Verdant Fields Farm',
      type: WorkplaceType.FARM,
      locationId: 'loc-1',
      regionId,
      capacity: 10,
      occupiedPositions: 10,
      vacancies: 0,
      positions: Array.from({ length: 10 }).map((_, i) => ({ id: `p-${i}`, occupantId: `c-${i}` })) as any[],
      inventoryId: 'inv-sustainability-farm'
    };
    worldService.engine.workplaceRepository.create(farm);
    supplyService.inventoryManager.createInventory('inv-sustainability-farm', 'farm-sustainability-1', 10000);

    // 2. Setup completely depleted water resource (0 m³)
    const water = resourceService.engine.resourceManager.addResource({
      id: 'water-aquifer-1',
      type: ResourceType.WATER,
      name: 'Deep Aquifer',
      category: ResourceCategory.RENEWABLE,
      unit: 'm³',
      renewable: true,
      regionId,
      currentAmount: 0, // 0 m³ = 0 L
      maximumAmount: 100000,
      naturalRecoveryRate: 200, // 200 m³/hr
      consumptionRate: 0,
      condition: { type: 'Water Quality', value: 0.9 },
      extractionDifficulty: 0,
      coordinates: { x: 0, y: 0 },
      radius: 500
    });

    // Mock Spring season and temperate conditions
    jest.spyOn(environmentService.engine.seasonManager, 'getCurrentSeason').mockReturnValue('Spring');
    jest.spyOn(environmentService.engine, 'getEnvironmentalState').mockReturnValue({
      regionId,
      temperature: 20,
      feelsLikeTemperature: 20,
      humidity: 60,
      windSpeed: 10,
      visibility: 20,
      cloudCoverage: 20,
      uvIndex: 4,
      airPressure: 1013
    });

    // A. Run Cycle 1 under water starvation: Yield should be 0
    await supplyService.productionEngine.runProductionCycle('cycle-starved-1');

    const starvedInv = supplyService.inventoryManager.getInventory('inv-sustainability-farm')!;
    const starvedWheat = starvedInv.items['wheat']?.totalQuantity || 0;
    expect(starvedWheat).toBe(0);

    const reportStarved = supplyService.productionEngine.getCropYieldReport('farm-sustainability-1');
    expect(['WATER_STARVED', 'RESOURCE_CONSTRAINED']).toContain(reportStarved?.status);
    expect(reportStarved?.finalYield).toBe(0);

    // B. Environmental event: Rain arrives and natural regeneration runs for 24 hours
    jest.spyOn(environmentService.engine.weatherManager, 'getRegionWeather').mockReturnValue({
      regionId,
      currentType: 'Rain',
      durationHours: 24,
      timeInCurrentWeather: 12
    });

    // Process daily regeneration interval
    resourceService.engine.processRegeneration('regen-interval-day-1', 24);

    const waterAfterRegen = resourceService.engine.resourceManager.getResourceById(regionId, water.id)!;
    // In Spring with Rain: 200 * 2.0 (Rain) * 1.3 (Spring) * 24 = 12,480 m³ = 12,480,000 L
    expect(waterAfterRegen.currentAmount).toBeGreaterThan(10000);

    // C. Run Cycle 2 under recovered conditions: Yield should recover naturally
    await supplyService.productionEngine.runProductionCycle('cycle-recovered-2');

    const recoveredInv = supplyService.inventoryManager.getInventory('inv-sustainability-farm')!;
    const recoveredWheat = recoveredInv.items['wheat']?.totalQuantity || 0;
    expect(recoveredWheat).toBe(1000); // Full base harvest restored!

    const reportRecovered = supplyService.productionEngine.getCropYieldReport('farm-sustainability-1');
    expect(reportRecovered?.status).toBe('OPTIMAL');
    expect(reportRecovered?.finalYield).toBe(1000);

    // Verify exactly-once water consumption for the recovered cycle:
    // 1000 kg wheat * 20 L/kg = 20,000 L = 20 m³ deducted
    const waterAfterHarvest = resourceService.engine.resourceManager.getResourceById(regionId, water.id)!;
    expect(waterAfterHarvest.currentAmount).toBeCloseTo(waterAfterRegen.currentAmount - 20, 1);
  });

  test('2. Water consumption and regeneration persistence across simulated cold restart', async () => {
    const worldId = 'world-persist-test';
    const regionId = 'reg-persist-test';
    const resourceId = 'res-water-persist';

    // 1. Create World and Region in database
    await prisma.world.create({
      data: {
        id: worldId,
        name: 'Persistent Test World',
        description: 'Test world for resource persistence',
        randomSeed: 42,
        creationTime: Math.floor(Date.now() / 1000),
        currentPopulation: 100,
        worldSize: 10000,
        width: 10000,
        height: 10000,
        climateProfile: 'Temperate',
        timeZone: 'UTC',
        version: '1.0',
        status: 'ACTIVE'
      }
    });

    await prisma.region.create({
      data: {
        id: regionId,
        worldId,
        name: 'Persistent Region',
        climate: 'Temperate',
        description: 'Region for persistence tests',
        population: 100,
        coordX: 0,
        coordY: 0,
        width: 10000,
        height: 10000
      }
    });

    // 2. Create resource in SQLite with initial 10,000 m³
    await prisma.resource.create({
      data: {
        id: resourceId,
        name: 'Stateful Aquifer',
        type: ResourceType.WATER,
        category: ResourceCategory.RENEWABLE,
        unit: 'm³',
        renewable: true,
        regionId,
        currentAmount: 10000,
        maximumAmount: 50000,
        naturalRecoveryRate: 100,
        consumptionRate: 0,
        conditionType: 'Water Quality',
        conditionValue: 0.85,
        extractionDifficulty: 0
      }
    });

    // Upsert SimulationState to point to this world
    await prisma.simulationState.upsert({
      where: { id: 'singleton' },
      create: {
        id: 'singleton',
        year: 2026,
        month: 5,
        day: 1,
        hour: 12,
        minute: 0,
        second: 0,
        speed: 1,
        activeWorldId: worldId
      },
      update: {
        activeWorldId: worldId
      }
    });

    // Bootstrap persistence to load state into memory
    await persistenceService.bootstrap();

    const memWaterInitial = resourceService.engine.resourceManager.getResourceById(regionId, resourceId);
    expect(memWaterInitial).toBeDefined();
    expect(memWaterInitial?.currentAmount).toBe(10000);

    // 3. Consume 3,000 m³ of water during simulation
    resourceService.engine.resourceManager.updateResource(regionId, resourceId, {
      currentAmount: 7000
    });

    // 4. Save state boundary
    await persistenceService.persistTickBoundary({});

    // Verify database record has updated to 7,000 m³
    const dbResourceAfterConsumption = await prisma.resource.findUnique({
      where: { id: resourceId }
    });
    expect(dbResourceAfterConsumption?.currentAmount).toBe(7000);

    // 5. Simulate cold restart: clear all in-memory services
    resourceService.reset();
    worldService.engine.reset();

    // Verify memory was cleared
    expect(resourceService.engine.resourceManager.getAllResources().length).toBe(0);

    // 6. Bootstrap from database
    await persistenceService.bootstrap();

    // Verify hydrated reserves accurately preserve the 7,000 m³
    const memWaterHydrated = resourceService.engine.resourceManager.getResourceById(regionId, resourceId);
    expect(memWaterHydrated).toBeDefined();
    expect(memWaterHydrated?.currentAmount).toBe(7000);
  });

  test('3. Regeneration idempotency survives cold restart and prevents duplicate gains on interval retry', async () => {
    const completedIntervalId = 'regen-interval-2026-06-01';

    // 1. Record completed simulation event in database
    await prisma.simulationEvent.upsert({
      where: { id: completedIntervalId },
      create: {
        id: completedIntervalId,
        name: 'Resource Regeneration Tick',
        description: 'Completed regeneration before restart',
        priority: 'Normal',
        status: 'Completed',
        scheduledTimeJson: JSON.stringify({ year: 2026, month: 6, day: 1, hour: 0, minute: 0, second: 0 }),
        createdTimeJson: JSON.stringify({ year: 2026, month: 6, day: 1, hour: 0, minute: 0, second: 0 }),
        handlerName: 'ResourceEngine.processRegeneration',
        sourceModule: 'ResourceEngine',
        targetModule: 'ResourceEngine',
        metadataJson: JSON.stringify({ intervalId: completedIntervalId })
      },
      update: {
        status: 'Completed'
      }
    });

    // 2. Hydrate completed intervals on bootstrap
    const completedEvents = await prisma.simulationEvent.findMany({
      where: {
        handlerName: 'ResourceEngine.processRegeneration',
        status: 'Completed'
      },
      select: { id: true }
    });
    for (const ev of completedEvents) {
      resourceService.engine.recordProcessedInterval(ev.id);
    }

    expect(resourceService.engine.isIntervalProcessed(completedIntervalId)).toBe(true);

    // Setup resource with 5,000 m³
    const regionId = 'reg-regen-idemp';
    const water = resourceService.engine.resourceManager.addResource({
      id: 'water-idemp-1',
      type: ResourceType.WATER,
      name: 'Spring Water',
      category: ResourceCategory.RENEWABLE,
      unit: 'm³',
      renewable: true,
      regionId,
      currentAmount: 5000,
      maximumAmount: 20000,
      naturalRecoveryRate: 100,
      consumptionRate: 0,
      condition: null,
      extractionDifficulty: 0,
      coordinates: { x: 0, y: 0 },
      radius: 100
    });

    // 3. Attempt to re-run the completed interval: Must be rejected by idempotency check
    resourceService.engine.processRegeneration(completedIntervalId, 24);

    const waterAfterRetry = resourceService.engine.resourceManager.getResourceById(regionId, water.id)!;
    expect(waterAfterRetry.currentAmount).toBe(5000); // NO duplicate gain!

    // 4. Executing a fresh, unrecorded interval: Must proceed and record completion
    const freshIntervalId = 'regen-interval-2026-06-02';
    resourceService.engine.processRegeneration(freshIntervalId, 24);

    const waterAfterFresh = resourceService.engine.resourceManager.getResourceById(regionId, water.id)!;
    expect(waterAfterFresh.currentAmount).toBeGreaterThan(5000);
    expect(resourceService.engine.isIntervalProcessed(freshIntervalId)).toBe(true);
  });

  test('4. End-to-end economic chain: Depletion -> Harvest drop -> Shortage -> Regeneration -> Supply recovery', async () => {
    const regionId = 'reg-econ-chain';

    // 1. Setup farm
    const farm: Workplace = {
      id: 'farm-econ-1',
      name: 'Valley Granary',
      type: WorkplaceType.FARM,
      locationId: 'loc-1',
      regionId,
      capacity: 10,
      occupiedPositions: 10,
      vacancies: 0,
      positions: Array.from({ length: 10 }).map((_, i) => ({ id: `p-${i}`, occupantId: `c-${i}` })) as any[],
      inventoryId: 'inv-econ-farm'
    };
    worldService.engine.workplaceRepository.create(farm);
    supplyService.inventoryManager.createInventory('inv-econ-farm', 'farm-econ-1', 10000);

    // Initial depleted water
    const water = resourceService.engine.resourceManager.addResource({
      id: 'water-econ-res',
      type: ResourceType.WATER,
      name: 'River Inflow',
      category: ResourceCategory.RENEWABLE,
      unit: 'm³',
      renewable: true,
      regionId,
      currentAmount: 0,
      maximumAmount: 50000,
      naturalRecoveryRate: 150,
      consumptionRate: 0,
      condition: null,
      extractionDifficulty: 0,
      coordinates: { x: 0, y: 0 },
      radius: 200
    });

    jest.spyOn(environmentService.engine.seasonManager, 'getCurrentSeason').mockReturnValue('Spring');

    // Cycle 1: Depleted -> 0 harvest
    await supplyService.productionEngine.runProductionCycle('econ-cycle-1');
    const inv1 = supplyService.inventoryManager.getInventory('inv-econ-farm')!;
    expect(inv1.items['wheat']?.totalQuantity || 0).toBe(0);

    // Regeneration occurs: 48 hours of rainfall
    jest.spyOn(environmentService.engine.weatherManager, 'getRegionWeather').mockReturnValue({
      regionId,
      currentType: 'Rain',
      durationHours: 48,
      timeInCurrentWeather: 24
    });
    resourceService.engine.processRegeneration('regen-econ-rain', 48);

    const waterReplenished = resourceService.engine.resourceManager.getResourceById(regionId, water.id)!;
    expect(waterReplenished.currentAmount).toBeGreaterThan(5000);

    // Cycle 2: Water replenished -> 1000 kg harvest added to inventory
    await supplyService.productionEngine.runProductionCycle('econ-cycle-2');
    const inv2 = supplyService.inventoryManager.getInventory('inv-econ-farm')!;
    expect(inv2.items['wheat']?.totalQuantity).toBe(1000);
  });
});
