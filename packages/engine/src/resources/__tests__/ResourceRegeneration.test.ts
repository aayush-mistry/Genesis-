import { ResourceEngine } from '../ResourceEngine';
import { ResourceCalculator } from '../ResourceCalculator';
import { ResourceManager } from '../ResourceManager';
import { WorldEngine } from '../../world/WorldEngine';
import { EnvironmentEngine } from '../../environment/EnvironmentEngine';
import { EventScheduler } from '../../events/EventScheduler';
import { TimeEngine } from '../../time/TimeEngine';
import { ResourceType, ResourceCategory, EnvironmentalState, WeatherData } from '@genesis/shared';

describe('T8.4 — Regional Resource Regeneration Unit Tests', () => {
  let timeEngine: TimeEngine;
  let eventScheduler: EventScheduler;
  let worldEngine: WorldEngine;
  let environmentEngine: EnvironmentEngine;
  let resourceEngine: ResourceEngine;
  let calculator: ResourceCalculator;
  let resourceManager: ResourceManager;

  beforeEach(() => {
    timeEngine = new TimeEngine();
    eventScheduler = new EventScheduler(timeEngine);
    worldEngine = new WorldEngine();
    environmentEngine = new EnvironmentEngine(worldEngine, eventScheduler, timeEngine);
    resourceEngine = new ResourceEngine(worldEngine, environmentEngine, eventScheduler, timeEngine);
    calculator = new ResourceCalculator();
    resourceManager = resourceEngine.resourceManager;

    worldEngine.regionManager.createRegion({
      name: 'Verdant Basin',
      climate: 'Temperate',
      description: 'Fertile valley with abundant aquifers',
      population: 0,
      coordinates: { x: 0, y: 0 },
      width: 1000,
      height: 1000,
      worldId: 'world-1',
      createdAt: new Date(),
      updatedAt: new Date()
    });
  });

  test('1. Resource regeneration over simulation time: Water regenerates deterministically', () => {
    const water = resourceManager.addResource({
      type: ResourceType.WATER,
      name: 'Central Aquifer',
      category: ResourceCategory.RENEWABLE,
      unit: 'm³',
      renewable: true,
      regionId: 'reg-regen-1',
      currentAmount: 10000,
      maximumAmount: 50000,
      naturalRecoveryRate: 100, // 100 m3 / hour
      consumptionRate: 0,
      condition: null,
      extractionDifficulty: 0.1,
      coordinates: { x: 0, y: 0 },
      radius: 500
    });

    // Neutral environment
    const envState: EnvironmentalState = {
      regionId: 'reg-regen-1',
      temperature: 20,
      feelsLikeTemperature: 20,
      humidity: 50,
      windSpeed: 10,
      visibility: 20,
      cloudCoverage: 10,
      uvIndex: 4,
      airPressure: 1013
    };
    const weather: WeatherData = {
      regionId: 'reg-regen-1',
      currentType: 'Sunny',
      durationHours: 10,
      timeInCurrentWeather: 1
    };

    // Calculate 24 hours of regeneration in Autumn (baseline 1.0)
    const update = calculator.calculateRegeneration(
      water,
      envState,
      weather,
      'Autumn',
      'Afternoon',
      24
    );

    // 10000 + (100 * 1.0 * 24) = 12400 m³
    expect(update.currentAmount).toBe(12400);
  });

  test('2. Resource capacity limits: Regeneration never exceeds configured maximumAmount', () => {
    const water = resourceManager.addResource({
      type: ResourceType.WATER,
      name: 'Full Reservoir',
      category: ResourceCategory.RENEWABLE,
      unit: 'm³',
      renewable: true,
      regionId: 'reg-regen-1',
      currentAmount: 49500,
      maximumAmount: 50000,
      naturalRecoveryRate: 100, // 100 m3 / hour
      consumptionRate: 0,
      condition: null,
      extractionDifficulty: 0.1,
      coordinates: { x: 0, y: 0 },
      radius: 500
    });

    const update = calculator.calculateRegeneration(
      water,
      null,
      null,
      'Autumn',
      'Afternoon',
      24 // Would generate 2400 m3, bringing to 51900 without cap
    );

    expect(update.currentAmount).toBe(50000);
  });

  test('3. No regeneration for unsupported or finite resources (Minerals, Non-Renewable, Operational)', () => {
    const iron = resourceManager.addResource({
      type: ResourceType.IRON,
      name: 'Iron Ore Deposit',
      category: ResourceCategory.NON_RENEWABLE,
      unit: 'tonnes',
      renewable: false,
      regionId: 'reg-regen-1',
      currentAmount: 5000,
      maximumAmount: 10000,
      naturalRecoveryRate: null,
      consumptionRate: 0,
      condition: null,
      extractionDifficulty: 0.5,
      coordinates: { x: 0, y: 0 },
      radius: 200
    });

    const coal = resourceManager.addResource({
      type: ResourceType.COAL,
      name: 'Coal Vein',
      category: ResourceCategory.NON_RENEWABLE,
      unit: 'tonnes',
      renewable: false,
      regionId: 'reg-regen-1',
      currentAmount: 8000,
      maximumAmount: 20000,
      naturalRecoveryRate: null,
      consumptionRate: 0,
      condition: null,
      extractionDifficulty: 0.4,
      coordinates: { x: 0, y: 0 },
      radius: 200
    });

    const fuel = resourceManager.addResource({
      type: ResourceType.FUEL,
      name: 'Refined Fuel',
      category: ResourceCategory.OPERATIONAL,
      unit: 'L',
      renewable: false,
      regionId: 'reg-regen-1',
      currentAmount: 500,
      maximumAmount: 2000,
      naturalRecoveryRate: null,
      consumptionRate: 0,
      condition: null,
      extractionDifficulty: 0,
      coordinates: { x: 0, y: 0 },
      radius: 100
    });

    // Test calculation for each finite resource
    expect(calculator.calculateRegeneration(iron, null, null, 'Spring', 'Afternoon', 24)).toEqual({});
    expect(calculator.calculateRegeneration(coal, null, null, 'Spring', 'Afternoon', 24)).toEqual({});
    expect(calculator.calculateRegeneration(fuel, null, null, 'Spring', 'Afternoon', 24)).toEqual({});
  });

  test('4. Environmental effects on regeneration: Rain & Storm boost water; Heatwave reduces it', () => {
    const water = resourceManager.addResource({
      type: ResourceType.WATER,
      name: 'Valley Aquifer',
      category: ResourceCategory.RENEWABLE,
      unit: 'm³',
      renewable: true,
      regionId: 'reg-regen-1',
      currentAmount: 10000,
      maximumAmount: 100000,
      naturalRecoveryRate: 100,
      consumptionRate: 0,
      condition: null,
      extractionDifficulty: 0.1,
      coordinates: { x: 0, y: 0 },
      radius: 500
    });

    // A. Rain weather
    const rainyWeather: WeatherData = {
      regionId: 'reg-regen-1',
      currentType: 'Rain',
      durationHours: 24,
      timeInCurrentWeather: 5
    };
    const rainUpdate = calculator.calculateRegeneration(
      water,
      null,
      rainyWeather,
      'Autumn',
      'Afternoon',
      24
    );
    // Rain modifier = 2.0 -> 100 * 2.0 * 24 = 4800 gain -> 14800
    expect(rainUpdate.currentAmount).toBe(14800);

    // B. Storm weather
    const stormWeather: WeatherData = {
      regionId: 'reg-regen-1',
      currentType: 'Storm',
      durationHours: 24,
      timeInCurrentWeather: 5
    };
    const stormUpdate = calculator.calculateRegeneration(
      water,
      null,
      stormWeather,
      'Autumn',
      'Afternoon',
      24
    );
    // Storm modifier = 2.5 -> 100 * 2.5 * 24 = 6000 gain -> 16000
    expect(stormUpdate.currentAmount).toBe(16000);

    // C. Extreme heat drought (Sunny, 42°C, 15% humidity)
    const droughtEnv: EnvironmentalState = {
      regionId: 'reg-regen-1',
      temperature: 42,
      feelsLikeTemperature: 45,
      humidity: 15,
      windSpeed: 5,
      visibility: 30,
      cloudCoverage: 0,
      uvIndex: 11,
      airPressure: 1010
    };
    const sunnyWeather: WeatherData = {
      regionId: 'reg-regen-1',
      currentType: 'Sunny',
      durationHours: 24,
      timeInCurrentWeather: 12
    };
    const droughtUpdate = calculator.calculateRegeneration(
      water,
      droughtEnv,
      sunnyWeather,
      'Summer',
      'Afternoon',
      24
    );
    // Evaporation and drought heavily suppresses water gain
    const droughtGain = droughtUpdate.currentAmount! - 10000;
    const rainGain = rainUpdate.currentAmount! - 10000;
    expect(droughtGain).toBeLessThan(rainGain * 0.3);
  });

  test('5. Water consumption and regeneration using consistent units (m³ vs L)', () => {
    // Aquifer is stored in m³ (1 m³ = 1000 L)
    const water = resourceManager.addResource({
      type: ResourceType.WATER,
      name: 'Regional Aquifer',
      category: ResourceCategory.RENEWABLE,
      unit: 'm³',
      renewable: true,
      regionId: 'reg-regen-1',
      currentAmount: 100, // 100 m³ = 100,000 L
      maximumAmount: 1000, // 1,000 m³ = 1,000,000 L
      naturalRecoveryRate: 5, // 5 m³/hr = 5,000 L/hr
      consumptionRate: 0,
      condition: null,
      extractionDifficulty: 0,
      coordinates: { x: 0, y: 0 },
      radius: 100
    });

    const consumptionEngine = resourceEngine.resourceConsumptionEngine;

    // Simulate consumption of 40,000 Litres (e.g. crop irrigation requirement)
    const def = {
      productId: 'wheat',
      unit: 'kg',
      baseYieldPerArea: 100,
      resourceRequirements: [{ resourceId: 'WATER', amountPerOutputUnit: 500 }]
    };

    // Allocate 80 kg planned harvest * 500 L/kg = 40,000 L
    const allocation = consumptionEngine.allocateResources(def as any, 80, 'farm-1', 'reg-regen-1')!;
    expect(allocation).not.toBeNull();
    expect(allocation.consumedResources[0].amount).toBe(40000); // 40,000 L

    // Deduct
    const consumed = consumptionEngine.consumeResources(allocation.allocationId);
    expect(consumed).toBe(true);

    // 100 m³ - (40,000 L / 1000) = 60 m³ remaining
    const updated = resourceManager.getResourceById('reg-regen-1', water.id)!;
    expect(updated.currentAmount).toBe(60);

    // Now regenerate for 4 hours at base 5 m³/hr = 20 m³
    const regenUpdate = calculator.calculateRegeneration(
      updated,
      null,
      null,
      'Autumn',
      'Afternoon',
      4
    );

    // 60 m³ + 20 m³ = 80 m³ (which equals 80,000 L)
    expect(regenUpdate.currentAmount).toBe(80);
  });

  test('6. Resource conservation and non-negative balances', () => {
    const forest = resourceManager.addResource({
      type: ResourceType.FORESTS,
      name: 'Old Growth Forest',
      category: ResourceCategory.RENEWABLE,
      unit: 'ha',
      renewable: true,
      regionId: 'reg-regen-1',
      currentAmount: 0, // completely clear-cut
      maximumAmount: 1000,
      naturalRecoveryRate: 2, // 2 ha/hr
      consumptionRate: 5, // high passive consumption or logging
      condition: null,
      extractionDifficulty: 0.2,
      coordinates: { x: 0, y: 0 },
      radius: 100
    });

    // If consumption exceeds recovery, currentAmount should clamp to 0, never negative
    const update = calculator.calculateRegeneration(
      forest,
      null,
      null,
      'Winter', // winter modifier 0.3 -> 2 * 0.3 = 0.6 ha/hr, while consumption is 5 ha/hr -> net negative
      'Afternoon',
      10
    );

    expect(update.currentAmount).toBe(0);
    expect(update.currentAmount).toBeGreaterThanOrEqual(0);
  });

  test('7. Idempotent processing of regeneration intervals', () => {
    const water = resourceManager.addResource({
      type: ResourceType.WATER,
      name: 'Spring',
      category: ResourceCategory.RENEWABLE,
      unit: 'm³',
      renewable: true,
      regionId: 'reg-regen-1',
      currentAmount: 1000,
      maximumAmount: 10000,
      naturalRecoveryRate: 50,
      consumptionRate: 0,
      condition: null,
      extractionDifficulty: 0,
      coordinates: { x: 0, y: 0 },
      radius: 100
    });

    const intervalId = 'regen-2026-05-15';

    // First execution: should process
    resourceEngine.processRegeneration(intervalId, 24);
    const amountAfterFirst = resourceManager.getResourceById('reg-regen-1', water.id)!.currentAmount;
    expect(amountAfterFirst).toBeGreaterThan(1000);
    expect(resourceEngine.isIntervalProcessed(intervalId)).toBe(true);

    // Duplicate execution with same intervalId: must NOT regenerate again
    resourceEngine.processRegeneration(intervalId, 24);
    const amountAfterDuplicate = resourceManager.getResourceById('reg-regen-1', water.id)!.currentAmount;
    expect(amountAfterDuplicate).toBe(amountAfterFirst);

    // New distinct interval ID: should process
    const nextIntervalId = 'regen-2026-05-16';
    resourceEngine.processRegeneration(nextIntervalId, 24);
    const amountAfterNext = resourceManager.getResourceById('reg-regen-1', water.id)!.currentAmount;
    expect(amountAfterNext).toBeGreaterThan(amountAfterFirst);
  });
});
