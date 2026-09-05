import { ResourceConsumptionEngine } from '../ResourceConsumptionEngine';
import { ResourceManager } from '../ResourceManager';
import { ProductionDefinition, ResourceCategory, ResourceType } from '@genesis/shared';

describe('ResourceConsumptionEngine', () => {
  let resourceManager: ResourceManager;
  let engine: ResourceConsumptionEngine;

  beforeEach(() => {
    resourceManager = new ResourceManager();
    engine = new ResourceConsumptionEngine(resourceManager);

    // Setup initial resources for 'reg-1'
    resourceManager.addResource({
      type: 'WATER' as any,
      name: 'Water Source',
      category: ResourceCategory.RENEWABLE,
      unit: 'L',
      renewable: true,
      regionId: 'reg-1',
      currentAmount: 1000,
      maximumAmount: 10000,
      naturalRecoveryRate: 10,
      consumptionRate: 0,
      condition: null,
      extractionDifficulty: 0,
      coordinates: { x: 0, y: 0 },
      radius: 100
    });

    resourceManager.addResource({
      type: 'SOIL_FERTILITY' as any,
      name: 'Soil',
      category: ResourceCategory.RENEWABLE,
      unit: 'fertility',
      renewable: true,
      regionId: 'reg-1',
      currentAmount: 10,
      maximumAmount: 100,
      naturalRecoveryRate: 1,
      consumptionRate: 0,
      condition: null,
      extractionDifficulty: 0,
      coordinates: { x: 0, y: 0 },
      radius: 100
    });

    resourceManager.addResource({
      type: ResourceType.FUEL,
      name: 'Diesel',
      category: ResourceCategory.OPERATIONAL,
      unit: 'L',
      renewable: false,
      regionId: 'reg-1',
      currentAmount: 10,
      maximumAmount: 1000,
      naturalRecoveryRate: null,
      consumptionRate: 0,
      condition: null,
      extractionDifficulty: 0,
      coordinates: { x: 0, y: 0 },
      radius: 100
    });
  });

  test('calculates correct max production (End-to-End Farm Test)', () => {
    const def: ProductionDefinition = {
      productId: 'wheat',
      unit: 'kg',
      baseYieldPerArea: 100,
      workersRequiredPerUnitArea: 1,
      resourceRequirements: [
        { resourceId: 'WATER', amountPerOutputUnit: 20 },
        { resourceId: 'SOIL_FERTILITY', amountPerOutputUnit: 0.05 },
        { resourceId: 'FUEL', amountPerOutputUnit: 0.02 }
      ]
    };

    const maxFeasible = engine.calculateMaximumProduction(def, 100, 'farm-1', 'reg-1');

    // Water supports 1000 / 20 = 50
    // Soil supports 10 / 0.05 = 200
    // Fuel supports 10 / 0.02 = 500
    // Limiting resource is Water -> 50 kg
    expect(maxFeasible).toBe(50);
  });

  test('allocates and consumes resources correctly', () => {
    const def: ProductionDefinition = {
      productId: 'wheat',
      unit: 'kg',
      baseYieldPerArea: 100,
      workersRequiredPerUnitArea: 1,
      resourceRequirements: [
        { resourceId: 'WATER', amountPerOutputUnit: 20 },
        { resourceId: 'SOIL_FERTILITY', amountPerOutputUnit: 0.05 },
        { resourceId: 'FUEL', amountPerOutputUnit: 0.02 }
      ]
    };

    const maxFeasible = engine.calculateMaximumProduction(def, 100, 'farm-1', 'reg-1');
    const allocation = engine.allocateResources(def, maxFeasible, 'farm-1', 'reg-1');

    expect(allocation).not.toBeNull();
    expect(allocation!.actualProduction).toBe(50);

    const success = engine.consumeResources(allocation!.allocationId);
    expect(success).toBe(true);

    const water = resourceManager.getResourcesByRegion('reg-1').find(r => (r.type as any) === 'WATER');
    const soil = resourceManager.getResourcesByRegion('reg-1').find(r => (r.type as any) === 'SOIL_FERTILITY');
    const fuel = resourceManager.getResourcesByRegion('reg-1').find(r => (r.type as any) === 'FUEL');

    expect(water!.currentAmount).toBe(0); // 1000 - (50 * 20)
    expect(soil!.currentAmount).toBe(7.5); // 10 - (50 * 0.05)
    expect(fuel!.currentAmount).toBe(9); // 10 - (50 * 0.02)
  });

  test('respects producer reserve (End-to-End Reserve Test)', () => {
    const def: ProductionDefinition = {
      productId: 'wheat',
      unit: 'kg',
      baseYieldPerArea: 100,
      workersRequiredPerUnitArea: 1,
      resourceRequirements: [
        { resourceId: 'WATER', amountPerOutputUnit: 20 }
      ]
    };

    // Total water = 10,000 L. Setting it in the manager.
    const waterRes = resourceManager.getResourcesByRegion('reg-1').find(r => r.type === 'WATER')!;
    waterRes.currentAmount = 10000;

    engine.setProducerReserve('farm-1', 'WATER', 2000);

    const maxFeasible = engine.calculateMaximumProduction(def, 500, 'farm-1', 'reg-1');
    
    // Available = 10,000 - 2,000 = 8,000.
    // Max feasible = 8,000 / 20 = 400.
    expect(maxFeasible).toBe(400);

    // If requested is 450, allocation fails because 450 > 400
    const failedAllocation = engine.allocateResources(def, 450, 'farm-1', 'reg-1');
    expect(failedAllocation).toBeNull();
  });

  test('respects regional reserve', () => {
    const def: ProductionDefinition = {
      productId: 'wheat',
      unit: 'kg',
      baseYieldPerArea: 100,
      workersRequiredPerUnitArea: 1,
      resourceRequirements: [
        { resourceId: 'WATER', amountPerOutputUnit: 1 }
      ]
    };

    const waterRes = resourceManager.getResourcesByRegion('reg-1').find(r => r.type === 'WATER')!;
    waterRes.currentAmount = 50000;
    waterRes.reservedAmount = 10000; // Regional reserve

    const maxFeasible = engine.calculateMaximumProduction(def, 45000, 'farm-1', 'reg-1');
    
    // Available = 50,000 - 10,000 = 40,000.
    expect(maxFeasible).toBe(40000);
  });

  test('calculates exportable surplus (End-to-End Export Test)', () => {
    const waterRes = resourceManager.getResourcesByRegion('reg-1').find(r => r.type === 'WATER')!;
    waterRes.currentAmount = 50000;
    waterRes.reservedAmount = 10000; // Regional reserve

    // Producer reserve
    engine.setProducerReserve('farm-1', 'WATER', 2000);

    // Pending allocation (committed quantity)
    const def: ProductionDefinition = {
      productId: 'wheat',
      unit: 'kg',
      baseYieldPerArea: 100,
      workersRequiredPerUnitArea: 1,
      resourceRequirements: [
        { resourceId: 'WATER', amountPerOutputUnit: 1 }
      ]
    };
    engine.allocateResources(def, 18000, 'farm-1', 'reg-1'); // Commits 18000 L

    // Surplus = 50000 - 10000 - 2000 - 18000 = 20000
    expect(engine.getExportableSurplus('reg-1', 'WATER')).toBe(20000);

    // Decrease amount
    waterRes.currentAmount = 25000;
    
    // Surplus = 25000 - 10000 - 2000 - 18000 = -5000 -> capped at 0
    expect(engine.getExportableSurplus('reg-1', 'WATER')).toBe(0);
  });
});
