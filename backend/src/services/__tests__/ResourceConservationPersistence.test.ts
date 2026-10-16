import { worldService } from '../world.service';
import { resourceService } from '../resource.service';
import { persistenceService } from '../persistence.service';
import { prisma } from '../../repositories/prisma';
import { 
  ResourceType, 
  ResourceCategory 
} from '@genesis/shared';

describe('T8.5 — Resource Conservation & Cold-Restart Persistence Tests', () => {
  jest.setTimeout(30000);

  const worldId = 'world-conservation-pers';
  const regionId = 'reg-conservation-pers';
  const waterId = 'res-water-pers-1';
  const ironId = 'res-iron-pers-1';
  const forestId = 'res-forest-pers-1';

  beforeAll(async () => {
    await prisma.simulationEvent.deleteMany();
    await prisma.transactionRecord.deleteMany();
    await prisma.consumptionRecord.deleteMany();
    await prisma.inventoryItem.deleteMany();
    await prisma.inventory.deleteMany();
    await prisma.workplace.deleteMany();
    await prisma.citizen.deleteMany();
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
    await prisma.citizen.deleteMany();
    await prisma.resource.deleteMany();
    await prisma.region.deleteMany();
    await prisma.world.deleteMany();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    worldService.engine.reset();
    resourceService.reset();
    const { citizenService } = await import('../citizen.service');
    citizenService.engine.listCitizens().forEach((c: any) => citizenService.engine.citizenRepository.delete(c.id));

    await prisma.simulationEvent.deleteMany();
    await prisma.citizen.deleteMany();
    await prisma.resource.deleteMany();
    await prisma.region.deleteMany();
    await prisma.world.deleteMany();

    // 1. Create World and Region in database
    await prisma.world.create({
      data: {
        id: worldId,
        name: 'Conservation World',
        description: 'Persistence verification world',
        randomSeed: 42,
        creationTime: Math.floor(Date.now() / 1000),
        currentPopulation: 0,
        worldSize: 10000,
        width: 10000,
        height: 10000,
        climateProfile: 'Temperate',
        timeZone: 'UTC',
        version: '1.0.0',
        status: 'ACTIVE'
      }
    });

    await prisma.region.create({
      data: {
        id: regionId,
        worldId,
        name: 'Persistent Valley',
        climate: 'Temperate',
        description: 'Valley with managed resources',
        population: 0,
        coordX: 0,
        coordY: 0,
        width: 5000,
        height: 5000
      }
    });

    // 2. Insert authoritative resource pool into database
    await prisma.resource.createMany({
      data: [
        {
          id: waterId,
          name: 'Valley Aquifer',
          type: ResourceType.WATER,
          category: ResourceCategory.RENEWABLE,
          unit: 'm³',
          renewable: true,
          regionId,
          coordX: 100,
          coordY: 100,
          radius: 250,
          currentAmount: 15000,
          maximumAmount: 50000,
          naturalRecoveryRate: 100,
          consumptionRate: 0,
          conditionType: 'Water Purity',
          conditionValue: 0.88,
          extractionDifficulty: 0.1,
          reservedAmount: 2500,
          tradable: true,
          exportable: true,
          borrowable: false
        },
        {
          id: ironId,
          name: 'Iron Vein',
          type: ResourceType.IRON,
          category: ResourceCategory.NON_RENEWABLE,
          unit: 'tonnes',
          renewable: false,
          regionId,
          coordX: 300,
          coordY: 300,
          radius: 150,
          currentAmount: 8500,
          maximumAmount: 20000,
          naturalRecoveryRate: null,
          consumptionRate: 0,
          conditionType: null,
          conditionValue: null,
          extractionDifficulty: 0.6,
          reservedAmount: 1000,
          tradable: true,
          exportable: true,
          borrowable: false
        },
        {
          id: forestId,
          name: 'Cedar Woodlands',
          type: ResourceType.FORESTS,
          category: ResourceCategory.RENEWABLE,
          unit: 'ha',
          renewable: true,
          regionId,
          coordX: 500,
          coordY: 500,
          radius: 400,
          currentAmount: 3200,
          maximumAmount: 5000,
          naturalRecoveryRate: 15,
          consumptionRate: 5,
          conditionType: 'Canopy Density',
          conditionValue: 0.95,
          extractionDifficulty: 0.2,
          reservedAmount: 500,
          tradable: true,
          exportable: true,
          borrowable: false
        }
      ]
    });

    // Point active simulation state to this world
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
  });

  test('1. Authoritative persistence and cold restart: Restores saved resource pools without reset, silent regeneration, or duplication', async () => {
    // 1. Perform cold-start bootstrap from database
    await persistenceService.bootstrap();

    // Verify all 3 resources are accurately hydrated
    const allHydrated = resourceService.engine.resourceManager.getAllResources();
    expect(allHydrated.length).toBe(3);

    const waterHydrated = resourceService.engine.resourceManager.getResourceById(regionId, waterId)!;
    expect(waterHydrated).toBeDefined();
    expect(waterHydrated.currentAmount).toBe(15000);
    expect(waterHydrated.maximumAmount).toBe(50000);
    expect(waterHydrated.condition?.type).toBe('Water Purity');
    expect(waterHydrated.condition?.value).toBe(0.88);
    expect(waterHydrated.reservedAmount).toBe(2500);

    const ironHydrated = resourceService.engine.resourceManager.getResourceById(regionId, ironId)!;
    expect(ironHydrated).toBeDefined();
    expect(ironHydrated.currentAmount).toBe(8500);
    expect(ironHydrated.renewable).toBe(false);
    expect(ironHydrated.reservedAmount).toBe(1000);

    const forestHydrated = resourceService.engine.resourceManager.getResourceById(regionId, forestId)!;
    expect(forestHydrated).toBeDefined();
    expect(forestHydrated.currentAmount).toBe(3200);
    expect(forestHydrated.condition?.value).toBe(0.95);

    // 2. Verify repeated bootstrap calls do NOT duplicate resources
    await persistenceService.bootstrap();
    const afterSecondBootstrap = resourceService.engine.resourceManager.getAllResources();
    expect(afterSecondBootstrap.length).toBe(3); // Exactly 3, no duplicates!

    // 3. Simulate discrete resource consumption during simulation
    // Consume 4,000 m³ water (down to 11,000) and 500 tonnes iron (down to 8,000)
    resourceService.engine.resourceManager.updateResource(regionId, waterId, {
      currentAmount: 11000,
      condition: { type: 'Water Purity', value: 0.85 }
    });
    resourceService.engine.resourceManager.updateResource(regionId, ironId, {
      currentAmount: 8000
    });

    // 4. Persist state boundary to database
    await persistenceService.persistTickBoundary({});

    // Verify database reflects the updated state
    const dbWater = await prisma.resource.findUnique({ where: { id: waterId } });
    expect(dbWater?.currentAmount).toBe(11000);
    expect(dbWater?.conditionValue).toBe(0.85);

    const dbIron = await prisma.resource.findUnique({ where: { id: ironId } });
    expect(dbIron?.currentAmount).toBe(8000);

    // 5. Simulate complete server cold restart
    resourceService.reset();
    worldService.engine.reset();
    expect(resourceService.engine.resourceManager.getAllResources().length).toBe(0);

    // Re-bootstrap from database
    await persistenceService.bootstrap();

    // Verify restored state precisely matches saved values: NO silent reset, NO silent regeneration
    const restoredWater = resourceService.engine.resourceManager.getResourceById(regionId, waterId)!;
    expect(restoredWater.currentAmount).toBe(11000);
    expect(restoredWater.condition?.value).toBe(0.85);
    expect(restoredWater.reservedAmount).toBe(2500);

    const restoredIron = resourceService.engine.resourceManager.getResourceById(regionId, ironId)!;
    expect(restoredIron.currentAmount).toBe(8000);
    expect(restoredIron.renewable).toBe(false);
  });

  test('2. Conservation and Idempotency across Cold Restart: Completed intervals cannot be re-applied after restart', async () => {
    const completedIntervalId = 'regen-interval-cold-restart-2026-07-01';

    // 1. Record completed event in SQLite
    await prisma.simulationEvent.create({
      data: {
        id: completedIntervalId,
        name: 'Resource Regeneration Tick',
        description: 'Completed interval before restart',
        priority: 'Normal',
        status: 'Completed',
        scheduledTimeJson: JSON.stringify({ year: 2026, month: 7, day: 1, hour: 0, minute: 0, second: 0 }),
        createdTimeJson: JSON.stringify({ year: 2026, month: 7, day: 1, hour: 0, minute: 0, second: 0 }),
        handlerName: 'ResourceEngine.processRegeneration',
        sourceModule: 'ResourceEngine',
        targetModule: 'ResourceEngine',
        metadataJson: JSON.stringify({ intervalId: completedIntervalId })
      }
    });

    // 2. Bootstrap from database
    await persistenceService.bootstrap();

    // Verify completed interval is recorded in memory
    expect(resourceService.engine.isIntervalProcessed(completedIntervalId)).toBe(true);

    const water = resourceService.engine.resourceManager.getResourceById(regionId, waterId)!;
    const amountBeforeRetry = water.currentAmount;

    // 3. Attempt to execute the completed interval again -> Must be a no-op!
    resourceService.engine.processRegeneration(completedIntervalId, 24);

    const waterAfterRetry = resourceService.engine.resourceManager.getResourceById(regionId, waterId)!;
    expect(waterAfterRetry.currentAmount).toBe(amountBeforeRetry);

    // 4. Executing a fresh interval ID -> Must process and advance renewable resources while preserving non-renewables
    const freshIntervalId = 'regen-interval-cold-restart-2026-07-02';
    resourceService.engine.processRegeneration(freshIntervalId, 24);

    const waterAfterFresh = resourceService.engine.resourceManager.getResourceById(regionId, waterId)!;
    expect(waterAfterFresh.currentAmount).toBeGreaterThan(amountBeforeRetry);

    const ironAfterFresh = resourceService.engine.resourceManager.getResourceById(regionId, ironId)!;
    expect(ironAfterFresh.currentAmount).toBe(8500); // Finite non-renewable strictly unchanged!
    expect(resourceService.engine.isIntervalProcessed(freshIntervalId)).toBe(true);
  });
});
