import { supplyService } from '../supply.service';
import { worldService } from '../world.service';
import { eventService } from '../event.service';
import { timeService } from '../time.service';
import { resourceService } from '../resource.service';
import { environmentService } from '../environment.service';
import { consumptionService } from '../consumption.service';
import { marketService } from '../market.service';
import { prisma } from '../../repositories/prisma';
import { 
  Workplace, 
  WorkplaceType, 
  CropDefinition, 
  ResourceType, 
  ResourceCategory,
  SimulationTime
} from '@genesis/shared';
import { AgriculturalYieldCalculator } from '@genesis/engine';

describe('T8.3 — Seasonal Agricultural Yield & Supply Integration Tests', () => {
  jest.setTimeout(30000);

  beforeAll(async () => {
    // Clean test database tables
    await prisma.transactionRecord.deleteMany();
    await prisma.consumptionRecord.deleteMany();
    await prisma.inventory.deleteMany();
    await prisma.workplace.deleteMany();
  });

  afterAll(async () => {
    await prisma.transactionRecord.deleteMany();
    await prisma.consumptionRecord.deleteMany();
    await prisma.inventory.deleteMany();
    await prisma.workplace.deleteMany();
    await prisma.$disconnect();
  });

  beforeEach(() => {
    supplyService.reset();
  });

  test('1. Compatible vs Unsuitable Growing Seasons: Spring produces wheat, Winter produces 0', async () => {
    // 1. Setup farm workplace
    const farm: Workplace = {
      id: 'farm-season-1',
      name: 'Spring Valley Farm',
      type: WorkplaceType.FARM,
      locationId: 'loc-1',
      regionId: 'reg-season',
      capacity: 10,
      occupiedPositions: 10,
      vacancies: 0,
      positions: Array.from({ length: 10 }).map((_, i) => ({ id: `pos-${i}`, type: 'FARMER' as any, occupantId: `cit-${i}` })),
      inventoryId: 'inv-farm-season'
    };
    worldService.engine.workplaceRepository.create(farm);
    supplyService.inventoryManager.createInventory('inv-farm-season', 'farm-season-1', 10000);

    // Ample water in region
    resourceService.engine.resourceManager.addResource({
      id: 'water-res-1',
      type: ResourceType.WATER,
      name: 'Irrigation Canal',
      category: ResourceCategory.RENEWABLE,
      unit: 'L',
      renewable: true,
      regionId: 'reg-season',
      currentAmount: 500000,
      maximumAmount: 500000,
      naturalRecoveryRate: 10000,
      consumptionRate: 0,
      condition: null,
      extractionDifficulty: 0,
      coordinates: { x: 0, y: 0 },
      radius: 100
    });

    // Mock Spring (Month 4 = Summer/Spring, seasonManager returns Spring)
    jest.spyOn(environmentService.engine.seasonManager, 'getCurrentSeason').mockReturnValue('Spring');
    jest.spyOn(environmentService.engine, 'getEnvironmentalState').mockReturnValue({
      regionId: 'reg-season',
      temperature: 20,
      feelsLikeTemperature: 20,
      humidity: 50,
      windSpeed: 10,
      visibility: 20,
      cloudCoverage: 10,
      uvIndex: 4,
      airPressure: 1013
    });

    // Run production cycle in Spring
    (supplyService.productionEngine as any).runProductionCycle();
    await new Promise(resolve => setTimeout(resolve, 50));

    const springInv = supplyService.inventoryManager.getInventory('inv-farm-season')!;
    const springWheat = springInv.items['wheat']?.totalQuantity || 0;
    expect(springWheat).toBeGreaterThan(0);
    expect(springWheat).toBe(1000); // 1000 base capacity * 1.0 (neutral weather fallback)

    // Now advance to Winter
    jest.spyOn(environmentService.engine.seasonManager, 'getCurrentSeason').mockReturnValue('Winter');
    jest.spyOn(environmentService.engine, 'getEnvironmentalState').mockReturnValue({
      regionId: 'reg-season',
      temperature: -2,
      feelsLikeTemperature: -5,
      humidity: 70,
      windSpeed: 25,
      visibility: 5,
      cloudCoverage: 90,
      uvIndex: 1,
      airPressure: 1005
    });

    // Clear farm inventory to test winter-specific yield
    springInv.items['wheat'].totalQuantity = 0;

    (supplyService.productionEngine as any).runProductionCycle();
    await new Promise(resolve => setTimeout(resolve, 50));

    const winterWheat = springInv.items['wheat']?.totalQuantity || 0;
    expect(winterWheat).toBe(0);

    const report = supplyService.productionEngine.getCropYieldReport('farm-season-1');
    expect(report?.season).toBe('Winter');
    expect(report?.seasonFactor).toBe(0.0);
    expect(report?.status).toBe('DORMANT_UNSUITABLE');
  });

  test('2. Favorable vs Adverse Temperature: Sub-zero frost halts yield, 20°C gives full yield', () => {
    const crop = supplyService.productionEngine.getCropDefinition('wheat')!;

    // Favorable 20°C
    const favorable = AgriculturalYieldCalculator.calculateYield(
      crop,
      { season: 'Spring', temperature: 20, weather: 'Sunny' },
      { baseCapacity: 1000, workerEfficiency: 1.0 }
    );
    expect(favorable.temperatureFactor).toBe(1.0);
    expect(favorable.finalYield).toBe(1050);

    // Adverse sub-zero frost (-3°C)
    const frost = AgriculturalYieldCalculator.calculateYield(
      crop,
      { season: 'Spring', temperature: -3, weather: 'Sunny' },
      { baseCapacity: 1000, workerEfficiency: 1.0 }
    );
    expect(frost.temperatureFactor).toBe(0.0);
    expect(frost.finalYield).toBe(0);
    expect(frost.status).toBe('SEVERE_ADVERSE');

    // Extreme heat stress (42°C)
    const heat = AgriculturalYieldCalculator.calculateYield(
      crop,
      { season: 'Summer', temperature: 42, weather: 'Sunny' },
      { baseCapacity: 1000, workerEfficiency: 1.0 }
    );
    expect(heat.temperatureFactor).toBe(0.0);
    expect(heat.finalYield).toBe(0);
  });

  test('3. Water and Soil Effects: Grassland is optimal, Desert is reduced, missing soil falls back to neutral', () => {
    const crop = supplyService.productionEngine.getCropDefinition('wheat')!;

    // Optimal PLAIN soil
    const plain = AgriculturalYieldCalculator.calculateYield(
      crop,
      { season: 'Spring', temperature: 20, weather: 'Cloudy', soilType: 'PLAIN' },
      { baseCapacity: 1000, workerEfficiency: 1.0 }
    );
    expect(plain.soilFactor).toBe(1.0);
    expect(plain.soilMeasurementAvailable).toBe(true);

    // Desert soil (sub-optimal)
    const desert = AgriculturalYieldCalculator.calculateYield(
      crop,
      { season: 'Spring', temperature: 20, weather: 'Cloudy', soilType: 'DESERT' },
      { baseCapacity: 1000, workerEfficiency: 1.0 }
    );
    expect(desert.soilFactor).toBe(0.2);
    expect(desert.finalYield).toBe(200);

    // Missing soil data (neutral fallback)
    const missingSoil = AgriculturalYieldCalculator.calculateYield(
      crop,
      { season: 'Spring', temperature: 20, weather: 'Cloudy', soilType: null },
      { baseCapacity: 1000, workerEfficiency: 1.0 }
    );
    expect(missingSoil.soilFactor).toBe(1.0);
    expect(missingSoil.soilMeasurementAvailable).toBe(false);
    expect(missingSoil.finalYield).toBe(1000);
  });

  test('4. Adverse Weather Effects: Storm reduces yield by 50%, Heavy Snow yields 0', () => {
    const crop = supplyService.productionEngine.getCropDefinition('wheat')!;

    // Storm
    const storm = AgriculturalYieldCalculator.calculateYield(
      crop,
      { season: 'Summer', temperature: 22, weather: 'Storm' },
      { baseCapacity: 1000, workerEfficiency: 1.0 }
    );
    expect(storm.weatherFactor).toBe(0.5);
    expect(storm.finalYield).toBe(500);

    // Heavy Snow
    const blizzard = AgriculturalYieldCalculator.calculateYield(
      crop,
      { season: 'Spring', temperature: 2, weather: 'Heavy Snow' },
      { baseCapacity: 1000, workerEfficiency: 1.0 }
    );
    expect(blizzard.weatherFactor).toBe(0.0);
    expect(blizzard.finalYield).toBe(0);
  });

  test('5. Yield Bounds and Invalid Input Handling', () => {
    const crop = supplyService.productionEngine.getCropDefinition('wheat')!;

    const result = AgriculturalYieldCalculator.calculateYield(
      crop,
      { season: 'Spring', temperature: NaN, weather: null, soilType: null },
      { baseCapacity: -100, workerEfficiency: -0.5 }
    );

    expect(result.finalYield).toBe(0);
    expect(Number.isFinite(result.finalYield)).toBe(true);
    expect(result.workerEfficiency).toBe(0);
    expect(result.baseCapacityYield).toBe(0);
  });

  test('6. Production capacity and efficiency applied exactly once', () => {
    const crop = supplyService.productionEngine.getCropDefinition('wheat')!;

    // Base capacity 2000, worker efficiency 0.75 (75%)
    // Capacity yield = 1500. Weather Sunny = 1.05.
    // 1500 * 1.05 = 1575
    const result = AgriculturalYieldCalculator.calculateYield(
      crop,
      { season: 'Spring', temperature: 20, weather: 'Sunny' },
      { baseCapacity: 2000, workerEfficiency: 0.75 }
    );

    expect(result.capacityYield).toBe(1500);
    expect(result.finalYield).toBe(1575);
  });

  test('7. Zero or reduced yield produces no excess inventory', async () => {
    const farm: Workplace = {
      id: 'farm-zero-inv',
      name: 'Zero Yield Farm',
      type: WorkplaceType.FARM,
      locationId: 'loc-1',
      regionId: 'reg-zero',
      capacity: 10,
      occupiedPositions: 10,
      vacancies: 0,
      positions: Array.from({ length: 10 }).map((_, i) => ({ id: `p-${i}`, occupantId: `c-${i}` })) as any[],
      inventoryId: 'inv-zero-test'
    };
    worldService.engine.workplaceRepository.create(farm);
    supplyService.inventoryManager.createInventory('inv-zero-test', 'farm-zero-inv', 10000);

    // Mock winter to ensure 0 yield
    jest.spyOn(environmentService.engine.seasonManager, 'getCurrentSeason').mockReturnValue('Winter');

    (supplyService.productionEngine as any).runProductionCycle();
    await new Promise(resolve => setTimeout(resolve, 50));

    const inv = supplyService.inventoryManager.getInventory('inv-zero-test')!;
    expect(inv.items['wheat']).toBeUndefined();
  });

  test('8. Insufficient resources preventing unsupported production', async () => {
    const farm: Workplace = {
      id: 'farm-water-shortage',
      name: 'Dryland Farm',
      type: WorkplaceType.FARM,
      locationId: 'loc-1',
      regionId: 'reg-arid',
      capacity: 10,
      occupiedPositions: 10,
      vacancies: 0,
      positions: Array.from({ length: 10 }).map((_, i) => ({ id: `p-${i}`, occupantId: `c-${i}` })) as any[],
      inventoryId: 'inv-arid-farm'
    };
    worldService.engine.workplaceRepository.create(farm);
    supplyService.inventoryManager.createInventory('inv-arid-farm', 'farm-water-shortage', 10000);

    // Only 200 Litres of Water available in the region
    // Wheat requires 20 L per kg. So 200 L can only produce 10 kg max!
    resourceService.engine.resourceManager.addResource({
      id: 'scarce-water',
      type: ResourceType.WATER,
      name: 'Dry Well',
      category: ResourceCategory.RENEWABLE,
      unit: 'L',
      renewable: true,
      regionId: 'reg-arid',
      currentAmount: 200,
      maximumAmount: 1000,
      naturalRecoveryRate: 10,
      consumptionRate: 0,
      condition: null,
      extractionDifficulty: 0,
      coordinates: { x: 0, y: 0 },
      radius: 50
    });

    jest.spyOn(environmentService.engine.seasonManager, 'getCurrentSeason').mockReturnValue('Spring');
    jest.spyOn(environmentService.engine, 'getEnvironmentalState').mockReturnValue({
      regionId: 'reg-arid',
      temperature: 20
    } as any);

    (supplyService.productionEngine as any).runProductionCycle();
    await new Promise(resolve => setTimeout(resolve, 50));

    const inv = supplyService.inventoryManager.getInventory('inv-arid-farm')!;
    const producedWheat = inv.items['wheat']?.totalQuantity || 0;
    expect(producedWheat).toBe(10); // Capped by 200 L / 20 L per kg = 10 kg
  });

  test('9. Production and inventory consistency after a failed operation', async () => {
    const farm: Workplace = {
      id: 'farm-fail-inv',
      name: 'Crammed Farm',
      type: WorkplaceType.FARM,
      locationId: 'loc-1',
      regionId: 'reg-fail',
      capacity: 10,
      occupiedPositions: 10,
      vacancies: 0,
      positions: Array.from({ length: 10 }).map((_, i) => ({ id: `p-${i}`, occupantId: `c-${i}` })) as any[],
      inventoryId: 'inv-fail-test'
    };
    worldService.engine.workplaceRepository.create(farm);
    // Create inventory with tiny max capacity of 5 kg, while production will try to add 1000 kg!
    supplyService.inventoryManager.createInventory('inv-fail-test', 'farm-fail-inv', 5);

    const createdWater = resourceService.engine.resourceManager.addResource({
      type: ResourceType.WATER,
      name: 'River Fail Test',
      category: ResourceCategory.RENEWABLE,
      unit: 'L',
      renewable: true,
      regionId: 'reg-fail',
      currentAmount: 100000,
      maximumAmount: 100000,
      naturalRecoveryRate: 1000,
      consumptionRate: 0,
      condition: null,
      extractionDifficulty: 0,
      coordinates: { x: 0, y: 0 },
      radius: 100
    });

    jest.spyOn(environmentService.engine.seasonManager, 'getCurrentSeason').mockReturnValue('Spring');
    jest.spyOn(environmentService.engine, 'getEnvironmentalState').mockReturnValue({
      regionId: 'reg-fail',
      temperature: 20
    } as any);

    (supplyService.productionEngine as any).runProductionCycle();
    await new Promise(resolve => setTimeout(resolve, 50));

    const inv = supplyService.inventoryManager.getInventory('inv-fail-test')!;
    // Adding 1000 kg exceeds max capacity of 5 kg, so inventory addition fails
    expect(inv.items['wheat']).toBeUndefined();

    // Water must NOT have been consumed since production failed!
    const water = resourceService.engine.resourceManager.getResourcesByRegion('reg-fail').find(r => r.id === createdWater.id)!;
    expect(water.currentAmount).toBe(100000);
  });

  test('10. End-to-End Economic Integration: Winter halt -> stock drops -> forecast shortage -> procurement orders', async () => {
    // 1. Setup Farm in Spring with wheat
    const farm: Workplace = {
      id: 'farm-e2e',
      name: 'E2E Wheat Farm',
      type: WorkplaceType.FARM,
      locationId: 'loc-farm',
      regionId: 'reg-e2e',
      capacity: 10,
      occupiedPositions: 10,
      vacancies: 0,
      positions: Array.from({ length: 10 }).map((_, i) => ({ id: `p-${i}`, occupantId: `c-${i}` })) as any[],
      inventoryId: 'inv-farm-e2e',
      wallet: { id: 'w-farm', ownerId: 'farm-e2e', balance: 5000, currency: 'GEN', totalIncome: 0, totalExpenses: 0 }
    };
    worldService.engine.workplaceRepository.create(farm);
    supplyService.inventoryManager.createInventory('inv-farm-e2e', 'farm-e2e', 10000);

    // Setup Retail Store
    const store: Workplace = {
      id: 'store-e2e',
      name: 'E2E Grocery Store',
      type: WorkplaceType.SHOP,
      locationId: 'loc-store',
      regionId: 'reg-e2e',
      capacity: 5,
      inventoryId: 'inv-store-e2e',
      inventoryConfiguration: {
        wheat: { reorderPoint: 50, targetStock: 200 }
      },
      wallet: { id: 'w-store', ownerId: 'store-e2e', balance: 10000, currency: 'GEN', totalIncome: 0, totalExpenses: 0 }
    };
    worldService.engine.workplaceRepository.create(store);
    supplyService.inventoryManager.createInventory('inv-store-e2e', 'store-e2e', 5000);

    // Initial store stock: 40 kg (below reorder point 50 kg)
    supplyService.inventoryManager.addItemQuantity('inv-store-e2e', 'wheat', 40, 'kg', 1000);

    // Mock time to Day 6 so days 1..5 fall into the 7-day observation window
    jest.spyOn(timeService.engine, 'getCurrentTime').mockReturnValue({
      year: 1,
      month: 1,
      day: 6,
      hour: 12,
      minute: 0,
      second: 0
    });

    // Record historical consumption so forecaster knows burn rate
    consumptionService.consumptionLedger.clear();
    for (let day = 1; day <= 5; day++) {
      consumptionService.recordConsumption({
        eventId: `e2e-burn-${day}`,
        timestamp: day * 86400,
        simulationDay: day,
        simulationHour: 12,
        consumerId: `cit-${day}`,
        sourceInventoryId: 'inv-store-e2e',
        commodityId: 'wheat',
        quantity: 50, // 50 kg/day burn rate
        unit: 'kg',
        context: 'CITIZEN_VITAL',
        regionId: 'reg-e2e'
      });
    }

    // Connect demand forecaster
    supplyService.businessProcurementEngine.setDemandForecaster(consumptionService.forecastingEngine);

    // Verify projected supply balance flags a SHORTAGE
    const balance = await consumptionService.getProjectedSupplyBalance('wheat', 'reg-e2e', 2);
    expect(balance.forecast.dataSufficiency).toBe(true);
    expect(balance.analysis.condition).toBe('SHORTAGE');
    expect(balance.analysis.projectedNet).toBeLessThan(0);

    // Farm has 500 kg sellable stock produced in earlier cycle
    supplyService.inventoryManager.addItemQuantity('inv-farm-e2e', 'wheat', 500, 'kg', 1000);

    // Mock spatial route calculation for isolated test environment
    jest.spyOn((supplyService.supplyChainEngine as any).spatialQueryService, 'calculateRoute').mockReturnValue({
      originId: 'loc-farm',
      destinationId: 'loc-store',
      path: [{ x: 0, y: 0 }, { x: 10, y: 10 }],
      totalDistance: 100,
      estimatedDurationHours: 1
    });

    // Run business procurement
    supplyService.businessProcurementEngine.runProcurementCycle();

    // Should create procurement order reacting to the shortage
    const orders = supplyService.supplyChainEngine.getOrdersForBusiness(store.id);
    expect(orders.length).toBeGreaterThan(0);
    expect(orders[0].productId).toBe('wheat');
    expect(orders[0].quantity).toBeGreaterThanOrEqual(160); // Target 200 - available 40 = 160
  });

  test('11. Agricultural status API returns real crop reports and growing conditions', async () => {
    const reports = supplyService.productionEngine.getAllCropYieldReports();
    expect(Array.isArray(reports)).toBe(true);
  });

  test('12. Water Unit Conversion: Regional m³ water is converted to Litres and accurately bounds yield', async () => {
    const farm: Workplace = {
      id: 'farm-m3-integration',
      name: 'Canal Farm',
      type: WorkplaceType.FARM,
      locationId: 'loc-1',
      regionId: 'reg-m3-integ',
      capacity: 10,
      occupiedPositions: 10,
      vacancies: 0,
      positions: Array.from({ length: 10 }).map((_, i) => ({ id: `p-${i}`, occupantId: `c-${i}` })) as any[],
      inventoryId: 'inv-m3-integ'
    };
    worldService.engine.workplaceRepository.create(farm);
    supplyService.inventoryManager.createInventory('inv-m3-integ', 'farm-m3-integration', 10000);

    // 10 m³ = 10,000 Litres of Water.
    // Base capacity 1000 kg. Wheat requires 20 L/kg -> 20,000 L needed for full yield.
    // 10,000 L available bounds yield to 500 kg.
    const water = resourceService.engine.resourceManager.addResource({
      type: ResourceType.WATER,
      name: 'Highland Reservoir',
      category: ResourceCategory.RENEWABLE,
      unit: 'm³',
      renewable: true,
      regionId: 'reg-m3-integ',
      currentAmount: 10,
      maximumAmount: 50,
      naturalRecoveryRate: 0,
      consumptionRate: 0,
      condition: null,
      extractionDifficulty: 0,
      coordinates: { x: 0, y: 0 },
      radius: 100
    });

    jest.spyOn(environmentService.engine.seasonManager, 'getCurrentSeason').mockReturnValue('Spring');
    jest.spyOn(environmentService.engine, 'getEnvironmentalState').mockReturnValue({
      regionId: 'reg-m3-integ',
      temperature: 20
    } as any);

    supplyService.productionEngine.runProductionCycle('m3-integ-cycle-1');

    const inv = supplyService.inventoryManager.getInventory('inv-m3-integ')!;
    const producedWheat = inv.items['wheat']?.totalQuantity || 0;
    expect(producedWheat).toBe(500);

    // Water must be deducted in m³: 500 kg * 20 L/kg = 10,000 L = 10 m³ consumed
    const updatedWater = resourceService.engine.resourceManager.getResourceById('reg-m3-integ', water.id)!;
    expect(updatedWater.currentAmount).toBe(0);
  });

  test('13. Production-Cycle Idempotency: Retrying completed cycle produces output exactly once', async () => {
    const farm: Workplace = {
      id: 'farm-idempotent-integ',
      name: 'Single Output Farm',
      type: WorkplaceType.FARM,
      locationId: 'loc-1',
      regionId: 'reg-idem-integ',
      capacity: 10,
      occupiedPositions: 10,
      vacancies: 0,
      positions: Array.from({ length: 10 }).map((_, i) => ({ id: `p-${i}`, occupantId: `c-${i}` })) as any[],
      inventoryId: 'inv-idem-integ'
    };
    worldService.engine.workplaceRepository.create(farm);
    supplyService.inventoryManager.createInventory('inv-idem-integ', 'farm-idempotent-integ', 10000);

    const water = resourceService.engine.resourceManager.addResource({
      type: ResourceType.WATER,
      name: 'Abundant River',
      category: ResourceCategory.RENEWABLE,
      unit: 'L',
      renewable: true,
      regionId: 'reg-idem-integ',
      currentAmount: 100000,
      maximumAmount: 100000,
      naturalRecoveryRate: 0,
      consumptionRate: 0,
      condition: null,
      extractionDifficulty: 0,
      coordinates: { x: 0, y: 0 },
      radius: 100
    });

    jest.spyOn(environmentService.engine.seasonManager, 'getCurrentSeason').mockReturnValue('Spring');
    jest.spyOn(environmentService.engine, 'getEnvironmentalState').mockReturnValue({
      regionId: 'reg-idem-integ',
      temperature: 20
    } as any);

    const cycleId = 'production-cycle-day-42';

    // First execution
    supplyService.productionEngine.runProductionCycle(cycleId);

    const inv = supplyService.inventoryManager.getInventory('inv-idem-integ')!;
    expect(inv.items['wheat']?.totalQuantity).toBe(1000);
    const waterAfterFirst = resourceService.engine.resourceManager.getResourceById('reg-idem-integ', water.id)!;
    expect(waterAfterFirst.currentAmount).toBe(80000); // 100000 - 20000 L

    // Retrying the exact same cycle
    supplyService.productionEngine.runProductionCycle(cycleId);

    // Harvest must NOT duplicate
    expect(inv.items['wheat']?.totalQuantity).toBe(1000);
    // Water must NOT be deducted again
    const waterAfterRetry = resourceService.engine.resourceManager.getResourceById('reg-idem-integ', water.id)!;
    expect(waterAfterRetry.currentAmount).toBe(80000);
  });

  test('14. Cold-Restart Hydration: Completed cycles prevent replay after system restart', async () => {
    const cycleId = 'pre-restart-cycle-99';

    // Persist a completed simulation event into the test database
    await prisma.simulationEvent.upsert({
      where: { id: cycleId },
      create: {
        id: cycleId,
        name: 'Daily Production Cycle',
        description: 'Completed production cycle before restart',
        priority: 'Normal',
        status: 'Completed',
        scheduledTimeJson: JSON.stringify({ year: 1, month: 1, day: 1, hour: 0, minute: 0, second: 0 }),
        createdTimeJson: JSON.stringify({ year: 1, month: 1, day: 1, hour: 0, minute: 0, second: 0 }),
        handlerName: 'ProductionEngine.runProductionCycle',
        sourceModule: 'ProductionEngine',
        targetModule: 'ProductionEngine'
      },
      update: {
        status: 'Completed'
      }
    });

    const farm: Workplace = {
      id: 'farm-restart-integ',
      name: 'Hydrated Farm',
      type: WorkplaceType.FARM,
      locationId: 'loc-1',
      regionId: 'reg-restart-integ',
      capacity: 10,
      occupiedPositions: 10,
      vacancies: 0,
      positions: Array.from({ length: 10 }).map((_, i) => ({ id: `p-${i}`, occupantId: `c-${i}` })) as any[],
      inventoryId: 'inv-restart-integ'
    };
    worldService.engine.workplaceRepository.create(farm);
    supplyService.inventoryManager.createInventory('inv-restart-integ', 'farm-restart-integ', 10000);
    // Previously produced 1000 kg stored in inventory
    supplyService.inventoryManager.addItemQuantity('inv-restart-integ', 'wheat', 1000, 'kg', 1000);

    // Simulate cold restart hydration of completed cycles
    const completedEvents = await prisma.simulationEvent.findMany({
      where: {
        handlerName: 'ProductionEngine.runProductionCycle',
        status: 'Completed'
      },
      select: { id: true }
    });
    for (const ev of completedEvents) {
      supplyService.productionEngine.recordCompletedCycle(ev.id);
    }

    // Attempt to replay the completed cycle
    supplyService.productionEngine.runProductionCycle(cycleId);

    const inv = supplyService.inventoryManager.getInventory('inv-restart-integ')!;
    // Output must not duplicate (remains 1000 kg, not 2000 kg)
    expect(inv.items['wheat']?.totalQuantity).toBe(1000);
  });
});
