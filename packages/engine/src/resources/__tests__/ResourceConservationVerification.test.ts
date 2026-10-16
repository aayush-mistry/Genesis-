import { ResourceEngine } from '../ResourceEngine';
import { ResourceCalculator } from '../ResourceCalculator';
import { ResourceManager } from '../ResourceManager';
import { ResourceConsumptionEngine } from '../ResourceConsumptionEngine';
import { WorldEngine } from '../../world/WorldEngine';
import { EnvironmentEngine } from '../../environment/EnvironmentEngine';
import { EventScheduler } from '../../events/EventScheduler';
import { TimeEngine } from '../../time/TimeEngine';
import { 
  ResourceType, 
  ResourceCategory, 
  EnvironmentalState, 
  WeatherData,
  ProductionDefinition
} from '@genesis/shared';
import { SimulationEvent } from '../../events/SimulationEvent';

describe('T8.5 — Resource Conservation & Verification Unit Tests', () => {
  let timeEngine: TimeEngine;
  let eventScheduler: EventScheduler;
  let worldEngine: WorldEngine;
  let environmentEngine: EnvironmentEngine;
  let resourceEngine: ResourceEngine;
  let calculator: ResourceCalculator;
  let resourceManager: ResourceManager;
  let consumptionEngine: ResourceConsumptionEngine;

  let testRegionId = 'reg-conservation-verify';

  beforeEach(() => {
    timeEngine = new TimeEngine();
    eventScheduler = new EventScheduler(timeEngine);
    worldEngine = new WorldEngine();
    environmentEngine = new EnvironmentEngine(worldEngine, eventScheduler, timeEngine);
    resourceEngine = new ResourceEngine(worldEngine, environmentEngine, eventScheduler, timeEngine);
    calculator = resourceEngine.resourceCalculator;
    resourceManager = resourceEngine.resourceManager;
    consumptionEngine = resourceEngine.resourceConsumptionEngine;

    const reg = worldEngine.regionManager.createRegion({
      name: 'Conservation Valley',
      climate: 'Temperate',
      description: 'Ecosystem for resource conservation validation',
      population: 0,
      coordinates: { x: 0, y: 0 },
      width: 5000,
      height: 5000,
      worldId: 'world-verify',
      createdAt: new Date(),
      updatedAt: new Date()
    });
    testRegionId = reg.id;
  });

  describe('1. Actual Resource Consumption Exactly-Once Semantics', () => {
    test('Deducts consumption exactly once and rejects duplicate consumption calls', () => {
      const water = resourceManager.addResource({
        type: ResourceType.WATER,
        name: 'Artesian Basin',
        category: ResourceCategory.RENEWABLE,
        unit: 'm³',
        renewable: true,
        regionId: testRegionId,
        currentAmount: 1000, // 1,000 m³ = 1,000,000 L
        maximumAmount: 5000,
        naturalRecoveryRate: 10,
        consumptionRate: 0,
        condition: null,
        extractionDifficulty: 0,
        coordinates: { x: 0, y: 0 },
        radius: 200
      });

      const def: ProductionDefinition = {
        productId: 'wheat',
        unit: 'kg',
        baseYieldPerArea: 100,
        workersRequiredPerUnitArea: 1,
        resourceRequirements: [
          { resourceId: 'WATER', amountPerOutputUnit: 500 } // 500 L per kg
        ]
      };

      // Allocate for 200 kg -> 200 * 500 = 100,000 L = 100 m³
      const allocation = consumptionEngine.allocateResources(def, 200, 'workplace-1', testRegionId);
      expect(allocation).not.toBeNull();
      expect(allocation!.consumedResources[0].amount).toBe(100000);

      // First consume call must succeed and deduct 100 m³
      const firstConsume = consumptionEngine.consumeResources(allocation!.allocationId);
      expect(firstConsume).toBe(true);

      const waterAfterFirst = resourceManager.getResourceById(testRegionId, water.id)!;
      expect(waterAfterFirst.currentAmount).toBe(900); // 1000 - 100 m³

      // Second consume call on the same allocation ID must return false and NOT deduct again
      const secondConsume = consumptionEngine.consumeResources(allocation!.allocationId);
      expect(secondConsume).toBe(false);

      const waterAfterSecond = resourceManager.getResourceById(testRegionId, water.id)!;
      expect(waterAfterSecond.currentAmount).toBe(900); // Unchanged! Exactly once.
    });

    test('Consumption releases reservation cleanly without deduction if cancelled', () => {
      const water = resourceManager.addResource({
        type: ResourceType.WATER,
        name: 'Artesian Basin',
        category: ResourceCategory.RENEWABLE,
        unit: 'm³',
        renewable: true,
        regionId: testRegionId,
        currentAmount: 500,
        maximumAmount: 2000,
        naturalRecoveryRate: 10,
        consumptionRate: 0,
        condition: null,
        extractionDifficulty: 0,
        coordinates: { x: 0, y: 0 },
        radius: 200
      });

      const def: ProductionDefinition = {
        productId: 'wheat',
        unit: 'kg',
        baseYieldPerArea: 100,
        workersRequiredPerUnitArea: 1,
        resourceRequirements: [
          { resourceId: 'WATER', amountPerOutputUnit: 500 }
        ]
      };

      const allocation = consumptionEngine.allocateResources(def, 100, 'workplace-1', testRegionId)!;
      expect(allocation).not.toBeNull();

      // Release without consuming
      consumptionEngine.releaseReservation(allocation.allocationId);

      // Attempting to consume released allocation fails
      const consumeResult = consumptionEngine.consumeResources(allocation.allocationId);
      expect(consumeResult).toBe(false);

      // Balance remains untouched
      const current = resourceManager.getResourceById(testRegionId, water.id)!;
      expect(current.currentAmount).toBe(500);
    });
  });

  describe('2. Continuous consumptionRate vs Actual Workplace Consumption', () => {
    test('Continuous consumptionRate models passive environmental drain separately from workplace deduction', () => {
      const forest = resourceManager.addResource({
        type: ResourceType.FORESTS,
        name: 'Pine Ridge',
        category: ResourceCategory.RENEWABLE,
        unit: 'ha',
        renewable: true,
        regionId: testRegionId,
        currentAmount: 1000,
        maximumAmount: 2000,
        naturalRecoveryRate: 5,   // +5 ha/hr base recovery
        consumptionRate: 2,       // -2 ha/hr passive decay/seepage
        condition: null,
        extractionDifficulty: 0.1,
        coordinates: { x: 0, y: 0 },
        radius: 100
      });

      // Passive calculation over 10 hours in Autumn (season modifier = 0.8):
      // Net change = (+5 * 0.8 * 10) - (2 * 10) = +40 - 20 = +20 ha
      const regenUpdate = calculator.calculateRegeneration(
        forest,
        null,
        null,
        'Autumn',
        'Afternoon',
        10
      );
      expect(regenUpdate.currentAmount).toBe(1020);

      // If workplace logging separately harvested 200 ha via resourceManager
      resourceManager.updateResource(testRegionId, forest.id, {
        currentAmount: 800
      });

      // Running regeneration on the post-harvest balance respects the separate discrete deduction:
      // 800 + 20 = 820 ha
      const updatedForest = resourceManager.getResourceById(testRegionId, forest.id)!;
      const nextRegen = calculator.calculateRegeneration(
        updatedForest,
        null,
        null,
        'Autumn',
        'Afternoon',
        10
      );
      expect(nextRegen.currentAmount).toBe(820);
    });
  });

  describe('3. Conservation Bounds & Clamping', () => {
    test('Resource balance never becomes negative even when consumption rate exceeds recovery', () => {
      const water = resourceManager.addResource({
        type: ResourceType.WATER,
        name: 'Drying Puddle',
        category: ResourceCategory.RENEWABLE,
        unit: 'm³',
        renewable: true,
        regionId: testRegionId,
        currentAmount: 50,
        maximumAmount: 1000,
        naturalRecoveryRate: 1,  // +1 m³/hr
        consumptionRate: 20,     // -20 m³/hr severe drain
        condition: null,
        extractionDifficulty: 0,
        coordinates: { x: 0, y: 0 },
        radius: 50
      });

      // 10 hours: 50 + 10 - 200 = -140 -> clamped to 0
      const update = calculator.calculateRegeneration(
        water,
        null,
        null,
        'Summer',
        'Afternoon',
        10
      );
      expect(update.currentAmount).toBe(0);
      expect(update.currentAmount).toBeGreaterThanOrEqual(0);
    });

    test('Resource regeneration never exceeds configured maximumAmount under repeated intervals', () => {
      const grasslands = resourceManager.addResource({
        type: ResourceType.GRASSLANDS,
        name: 'Lush Meadow',
        category: ResourceCategory.RENEWABLE,
        unit: 'ha',
        renewable: true,
        regionId: testRegionId,
        currentAmount: 980,
        maximumAmount: 1000,
        naturalRecoveryRate: 50, // Rapid growth
        consumptionRate: 0,
        condition: null,
        extractionDifficulty: 0,
        coordinates: { x: 0, y: 0 },
        radius: 100
      });

      // Regeneration of 24 hours at 50 ha/hr = 1200 ha potential -> clamped strictly to 1000
      const update = calculator.calculateRegeneration(
        grasslands,
        null,
        null,
        'Spring',
        'Afternoon',
        24
      );
      expect(update.currentAmount).toBe(1000);
      expect(update.currentAmount).toBeLessThanOrEqual(1000);
    });
  });

  describe('4. Strict Non-Regeneration of Finite & Unsupported Resources', () => {
    test('Finite minerals, fossil fuels, operational materials, and unsupported types never regenerate', () => {
      const nonRenewables = [
        { type: ResourceType.IRON, cat: ResourceCategory.NON_RENEWABLE, unit: 'tonnes', amt: 5000, max: 10000 },
        { type: ResourceType.COPPER, cat: ResourceCategory.NON_RENEWABLE, unit: 'tonnes', amt: 3000, max: 8000 },
        { type: ResourceType.COAL, cat: ResourceCategory.NON_RENEWABLE, unit: 'tonnes', amt: 12000, max: 25000 },
        { type: ResourceType.GOLD, cat: ResourceCategory.NON_RENEWABLE, unit: 'kg', amt: 200, max: 1000 },
        { type: ResourceType.OIL, cat: ResourceCategory.NON_RENEWABLE, unit: 'barrels', amt: 4000, max: 10000 },
        { type: ResourceType.NATURAL_GAS, cat: ResourceCategory.NON_RENEWABLE, unit: 'm³', amt: 80000, max: 200000 },
        { type: ResourceType.STONE, cat: ResourceCategory.NON_RENEWABLE, unit: 'tonnes', amt: 50000, max: 100000 },
        { type: ResourceType.FUEL, cat: ResourceCategory.OPERATIONAL, unit: 'L', amt: 500, max: 2000 },
        { type: ResourceType.FERTILIZER, cat: ResourceCategory.OPERATIONAL, unit: 'kg', amt: 800, max: 5000 }
      ];

      for (const item of nonRenewables) {
        const res = resourceManager.addResource({
          type: item.type,
          name: `Resource-${item.type}`,
          category: item.cat,
          unit: item.unit,
          renewable: false,
          regionId: testRegionId,
          currentAmount: item.amt,
          maximumAmount: item.max,
          naturalRecoveryRate: 100, // Even if a rogue recovery rate was passed, guard must reject it
          consumptionRate: 0,
          condition: null,
          extractionDifficulty: 0.5,
          coordinates: { x: 0, y: 0 },
          radius: 100
        });

        // Test in Spring with Rain
        const env: EnvironmentalState = {
          regionId: testRegionId,
          temperature: 20,
          feelsLikeTemperature: 20,
          humidity: 80,
          windSpeed: 10,
          visibility: 20,
          cloudCoverage: 10,
          uvIndex: 4,
          airPressure: 1013
        };
        const weather: WeatherData = {
          regionId: testRegionId,
          currentType: 'Rain',
          durationHours: 24,
          timeInCurrentWeather: 10
        };

        const result = calculator.calculateRegeneration(res, env, weather, 'Spring', 'Afternoon', 48);
        expect(result).toEqual({});
      }
    });
  });

  describe('5. Repeated Interval Processing & Recurrence Idempotency', () => {
    test('Repeated calls for the same interval ID are executed exactly once', () => {
      const water = resourceManager.addResource({
        type: ResourceType.WATER,
        name: 'Valley Spring',
        category: ResourceCategory.RENEWABLE,
        unit: 'm³',
        renewable: true,
        regionId: testRegionId,
        currentAmount: 2000,
        maximumAmount: 10000,
        naturalRecoveryRate: 50,
        consumptionRate: 0,
        condition: null,
        extractionDifficulty: 0,
        coordinates: { x: 0, y: 0 },
        radius: 100
      });

      const intervalId = 'regen-interval-verify-1';

      // 1st run
      resourceEngine.processRegeneration(intervalId, 24);
      const afterFirst = resourceManager.getResourceById(testRegionId, water.id)!.currentAmount;
      expect(afterFirst).toBeGreaterThan(2000);
      expect(resourceEngine.isIntervalProcessed(intervalId)).toBe(true);

      // 2nd run with same interval ID -> no change
      resourceEngine.processRegeneration(intervalId, 24);
      const afterSecond = resourceManager.getResourceById(testRegionId, water.id)!.currentAmount;
      expect(afterSecond).toBe(afterFirst);

      // 3rd run with same interval ID -> no change
      resourceEngine.processRegeneration(intervalId, 24);
      const afterThird = resourceManager.getResourceById(testRegionId, water.id)!.currentAmount;
      expect(afterThird).toBe(afterFirst);
    });

    test('Recurring simulation events process once per distinct recurrence interval', () => {
      const water = resourceManager.addResource({
        type: ResourceType.WATER,
        name: 'Reservoir',
        category: ResourceCategory.RENEWABLE,
        unit: 'm³',
        renewable: true,
        regionId: testRegionId,
        currentAmount: 1000,
        maximumAmount: 50000,
        naturalRecoveryRate: 100,
        consumptionRate: 0,
        condition: null,
        extractionDifficulty: 0,
        coordinates: { x: 0, y: 0 },
        radius: 100
      });

      const baseEvent: SimulationEvent = {
        id: 'regen-daily-1',
        name: 'Daily Regeneration',
        description: 'Scheduled regen',
        scheduledTime: { year: 2026, month: 5, day: 1, hour: 0, minute: 0, second: 0 },
        createdTime: { year: 2026, month: 5, day: 1, hour: 0, minute: 0, second: 0 },
        priority: 'Normal',
        status: 'Scheduled',
        cancelFlag: false,
        retryCount: 0,
        sourceModule: 'ResourceEngine',
        targetModule: 'ResourceEngine',
        recurrence: { interval: 'Day' },
        handlerName: 'ResourceEngine.processRegeneration',
        metadata: { intervalId: 'regen-daily-1', hoursElapsed: 24 }
      };

      // Day 1 executes
      resourceEngine.processRegeneration(baseEvent);
      const amountDay1 = resourceManager.getResourceById(testRegionId, water.id)!.currentAmount;
      expect(amountDay1).toBeGreaterThan(1000);
      expect(resourceEngine.isIntervalProcessed('regen-daily-1')).toBe(true);

      // Retry Day 1 event -> Must be skipped
      resourceEngine.processRegeneration(baseEvent);
      expect(resourceManager.getResourceById(testRegionId, water.id)!.currentAmount).toBe(amountDay1);

      // Day 2 (recurrenceCount = 1)
      const day2Event: SimulationEvent = {
        ...baseEvent,
        id: 'regen-daily-1-rec-1',
        recurrenceCount: 1,
        scheduledTime: { year: 2026, month: 5, day: 2, hour: 0, minute: 0, second: 0 },
        metadata: { intervalId: 'regen-daily-1-rec-1', hoursElapsed: 24 }
      };

      resourceEngine.processRegeneration(day2Event);
      const amountDay2 = resourceManager.getResourceById(testRegionId, water.id)!.currentAmount;
      expect(amountDay2).toBeGreaterThan(amountDay1);
      expect(resourceEngine.isIntervalProcessed('regen-daily-1-rec-1')).toBe(true);

      // Retry Day 2 event -> Must be skipped
      resourceEngine.processRegeneration(day2Event);
      expect(resourceManager.getResourceById(testRegionId, water.id)!.currentAmount).toBe(amountDay2);
    });
  });

  describe('6. Multi-Cycle: Consumption followed by Natural Regeneration', () => {
    test('Simulates a farm drawing water, followed by natural regeneration refilling the aquifer', () => {
      const initialWater = 2000;
      const water = resourceManager.addResource({
        type: ResourceType.WATER,
        name: 'Irrigation Aquifer',
        category: ResourceCategory.RENEWABLE,
        unit: 'm³',
        renewable: true,
        regionId: testRegionId,
        currentAmount: initialWater, // 2,000 m³ = 2,000,000 L
        maximumAmount: 10000,
        naturalRecoveryRate: 20, // 20 m³/hr
        consumptionRate: 0,
        condition: { type: 'Purity', value: 0.9 },
        extractionDifficulty: 0,
        coordinates: { x: 0, y: 0 },
        radius: 100
      });

      const farmCropDef: ProductionDefinition = {
        productId: 'wheat',
        unit: 'kg',
        baseYieldPerArea: 100,
        workersRequiredPerUnitArea: 1,
        resourceRequirements: [
          { resourceId: 'WATER', amountPerOutputUnit: 500 } // 500 L/kg
        ]
      };

      // 1. Farm consumes 800 m³ (800,000 L -> 1600 kg yield)
      const alloc = consumptionEngine.allocateResources(farmCropDef, 1600, 'farm-field-1', testRegionId)!;
      expect(alloc).not.toBeNull();
      const consumed = consumptionEngine.consumeResources(alloc.allocationId);
      expect(consumed).toBe(true);

      const postConsumption = resourceManager.getResourceById(testRegionId, water.id)!.currentAmount;
      expect(postConsumption).toBe(1200); // 2000 - 800 m³

      // 2. Regeneration tick runs for 24 hours under Spring conditions (multiplier = 1.3)
      // Gain = 20 m³/hr * 1.3 * 24 = 624 m³
      resourceEngine.processRegeneration('interval-regen-post-consume', 24);

      const postRegen = resourceManager.getResourceById(testRegionId, water.id)!.currentAmount;
      expect(postRegen).toBe(1824); // 1200 + 624 m³

      // 3. Further consumption of 500 m³ (500,000 L -> 1000 kg yield)
      const alloc2 = consumptionEngine.allocateResources(farmCropDef, 1000, 'farm-field-1', testRegionId)!;
      consumptionEngine.consumeResources(alloc2.allocationId);

      const postConsume2 = resourceManager.getResourceById(testRegionId, water.id)!.currentAmount;
      expect(postConsume2).toBe(1324); // 1824 - 500 m³
    });
  });
});
