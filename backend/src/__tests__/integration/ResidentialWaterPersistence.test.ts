import { prisma } from '../../repositories/prisma';
import { worldService } from '../../services/world.service';
import { resourceService } from '../../services/resource.service';
import { citizenService } from '../../services/citizen.service';
import { marketService } from '../../services/market.service';
import { persistenceService } from '../../services/persistence.service';
import { resourceRepository } from '../../repositories/ResourceRepository';
import { financialRepository } from '../../repositories/FinancialRepository';
import { BuildingType, ResourceType, ResourceCategory, CitizenGender, CitizenStatus } from '@genesis/shared';
import { EventRegistry } from '@genesis/engine';

describe('Residential Water Infrastructure Persistence & Cold Restart (T8.6.3)', () => {
  const worldId = 'test-world-water-pers';
  const regionId = 'test-reg-water-pers';
  const cityId = 'test-city-water-pers';
  const districtId = 'test-dist-water-pers';
  const buildingId = 'test-bld-water-pers';
  const householdId = 'test-hh-water-pers';
  const citizenId = 'test-cit-water-pers';
  const resourceId = 'test-res-water-pers';
  const invId = 'test-inv-hh-water-pers';
  const walletId = 'test-wal-cit-water-pers';

  beforeAll(async () => {
    // Clean up test tables
    await prisma.transactionRecord.deleteMany();
    await prisma.consumptionRecord.deleteMany();
    await prisma.resource.deleteMany();
    await prisma.citizen.deleteMany();
    await prisma.household.deleteMany();
    await prisma.inventoryItem.deleteMany();
    await prisma.inventory.deleteMany();
    await prisma.wallet.deleteMany();
    await prisma.room.deleteMany();
    await prisma.building.deleteMany();
    await prisma.district.deleteMany();
    await prisma.city.deleteMany();
    await prisma.region.deleteMany();
    await prisma.world.deleteMany();

    // 1. Create World hierarchy
    await prisma.world.create({
      data: {
        id: worldId,
        name: 'Water Persistence World',
        description: 'Test world for residential water persistence',
        randomSeed: 42,
        creationTime: 1,
        worldSize: 1000,
        width: 1000,
        height: 1000,
        climateProfile: 'TEMPERATE',
        timeZone: 'UTC',
        version: '1.0.0',
        status: 'ACTIVE'
      }
    });

    await prisma.simulationState.upsert({
      where: { id: 'singleton' },
      create: { id: 'singleton', activeWorldId: worldId },
      update: { activeWorldId: worldId }
    });

    await prisma.region.create({
      data: {
        id: regionId,
        worldId,
        name: 'Water Region',
        description: 'Water Region description',
        climate: 'TEMPERATE',
        coordX: 0,
        coordY: 0,
        width: 1000,
        height: 1000
      }
    });

    await prisma.city.create({
      data: {
        id: cityId,
        regionId,
        name: 'Water City',
        area: 40000,
        coordX: 100,
        coordY: 100,
        width: 200,
        height: 200
      }
    });

    await prisma.district.create({
      data: {
        id: districtId,
        cityId,
        name: 'Residential District',
        type: 'RESIDENTIAL',
        coordX: 110,
        coordY: 110,
        width: 100,
        height: 100
      }
    });

    await prisma.building.create({
      data: {
        id: buildingId,
        districtId,
        name: 'Marina Towers',
        type: BuildingType.APARTMENT,
        coordX: 120,
        coordY: 120,
        width: 30,
        height: 30,
        capacity: 100,
        status: 'ACTIVE',
        metadataJson: JSON.stringify({ hasWaterConnection: true })
      }
    });

    // 2. Create regional water resource (100 m³)
    await prisma.resource.create({
      data: {
        id: resourceId,
        name: 'Regional Aquifer',
        type: ResourceType.WATER,
        category: ResourceCategory.RENEWABLE,
        unit: 'm³',
        renewable: true,
        regionId,
        coordX: 50,
        coordY: 50,
        radius: 100,
        currentAmount: 100.0,
        maximumAmount: 100.0,
        naturalRecoveryRate: 0.1,
        consumptionRate: 0,
        extractionDifficulty: 1,
        tradable: true,
        borrowable: false,
        exportable: false,
        reservedAmount: 0
      }
    });

    // 3. Create Household, Inventory & Wallet
    await prisma.inventory.create({
      data: {
        id: invId,
        ownerId: householdId,
        storageCapacity: 500
      }
    });

    const hhWalletId = 'test-wal-hh-water-pers';
    await prisma.wallet.create({
      data: {
        id: hhWalletId,
        ownerId: householdId,
        currency: 'GEN',
        balance: 100.0,
        totalIncome: 100.0,
        totalExpenses: 0.0
      }
    });

    await prisma.household.create({
      data: {
        id: householdId,
        locationId: buildingId,
        inventoryId: invId,
        walletId: hhWalletId
      }
    });

    // 4. Create Citizen & Wallet
    await prisma.wallet.create({
      data: {
        id: walletId,
        ownerId: citizenId,
        currency: 'GEN',
        balance: 10.0,
        totalIncome: 10.0,
        totalExpenses: 0.0
      }
    });

    await prisma.citizen.create({
      data: {
        id: citizenId,
        name: 'John Doe',
        gender: CitizenGender.MALE,
        status: CitizenStatus.ACTIVE,
        locationId: buildingId,
        householdId,
        walletId,
        coordX: 120,
        coordY: 120,
        employmentStatus: 'EMPLOYED',
        birthDateJson: JSON.stringify({ year: 1, month: 1, day: 1, hour: 0, minute: 0, second: 0 }),
        createdAtSimJson: JSON.stringify({ year: 1, month: 1, day: 1, hour: 0, minute: 0, second: 0 }),
        personalityJson: JSON.stringify({ priceSensitivity: 50 }),
        skillsJson: JSON.stringify([]),
        vitalStateJson: JSON.stringify({
          hunger: 20,
          thirst: 70, // 50 thirst deficit requires 2 L
          energy: 100,
          health: 100,
          lastUpdatedSimulationTime: { year: 1, month: 1, day: 1, hour: 0, minute: 0, second: 0 }
        })
      }
    });
  });

  afterAll(async () => {
    await prisma.transactionRecord.deleteMany();
    await prisma.consumptionRecord.deleteMany();
    await prisma.resource.deleteMany();
    await prisma.citizen.deleteMany();
    await prisma.household.deleteMany();
    await prisma.inventoryItem.deleteMany();
    await prisma.inventory.deleteMany();
    await prisma.wallet.deleteMany();
    await prisma.room.deleteMany();
    await prisma.building.deleteMany();
    await prisma.district.deleteMany();
    await prisma.city.deleteMany();
    await prisma.region.deleteMany();
    await prisma.world.deleteMany();
    await prisma.$disconnect();
    EventRegistry.clear();
  });

  it('1. End-to-end residential water consumption, tick boundary persistence, and cold restart verification', async () => {
    // Initial bootstrap into memory
    await persistenceService.bootstrap();
    await citizenService.initialize();
    marketService.initialize();

    // Verify building has active water connection in engine
    const bld = worldService.engine.buildingManager.getBuilding(buildingId);
    expect(bld).toBeDefined();
    expect(worldService.engine.buildingManager.hasWaterConnection(buildingId)).toBe(true);

    // Verify in-memory water resource
    const res = resourceService.engine.resourceManager.getResourceById(regionId, resourceId);
    expect(res).toBeDefined();
    expect(res!.currentAmount).toBe(100.0);

    // Get citizen from in-memory engine
    const memCitizen = citizenService.engine.getCitizen(citizenId)!;
    expect(memCitizen).toBeDefined();
    expect(memCitizen.vitalState.thirst).toBe(70);
    expect(memCitizen.wallet!.balance).toBe(10.0);

    // Execute residential water consumption through ActionExecutor / ConsumptionEngine
    const consumptionEngine = citizenService.engine.actionExecutor.consumptionEngine!;
    expect(consumptionEngine).toBeDefined();

    // Consume water: requires 2 L (0.002 m³) at 0.05 credits/L = 0.10 credits
    const success = consumptionEngine.consume(
      memCitizen,
      'THIRST',
      1000,
      undefined,
      'evt-pers-drink-1',
      'RESIDENTIAL_WATER',
      regionId
    );
    expect(success).toBe(true);

    // Verify in-memory state post-drink
    expect(memCitizen.vitalState.thirst).toBe(20);
    expect(memCitizen.wallet!.balance).toBe(9.90);
    expect(resourceService.engine.resourceManager.getResourceById(regionId, resourceId)!.currentAmount).toBe(99.998);

    const utilityWallet = marketService.engine.getOrCreateUtilityWallet(regionId);
    expect(utilityWallet.balance).toBe(0.10);

    // Persist at tick boundary
    await persistenceService.persistTickBoundary({
      citizens: [citizenId],
      households: [householdId]
    });

    // 2. Verify database records updated correctly
    const dbRes = await resourceRepository.getResourceById(resourceId);
    expect(dbRes).toBeDefined();
    expect(dbRes!.currentAmount).toBe(99.998);

    const dbCitizenWallet = await financialRepository.getWalletByOwner(citizenId);
    expect(dbCitizenWallet).toBeDefined();
    expect(dbCitizenWallet!.balance).toBe(9.90);

    const dbUtilityWallet = await financialRepository.getWalletByOwner(utilityWallet.ownerId);
    expect(dbUtilityWallet).toBeDefined();
    expect(dbUtilityWallet!.balance).toBe(0.10);

    // 3. Simulate cold restart: clear all in-memory services
    worldService.engine.reset();
    resourceService.reset();
    citizenService.reset();
    marketService.initialize();

    // Bootstrap again from DB
    await persistenceService.bootstrap();
    await citizenService.initialize();

    // 4. Verify post-restart state in engine
    const reloadedBld = worldService.engine.buildingManager.getBuilding(buildingId);
    expect(reloadedBld).toBeDefined();
    expect(reloadedBld!.metadata?.hasWaterConnection).toBe(true);
    expect(worldService.engine.buildingManager.hasWaterConnection(buildingId)).toBe(true);

    const reloadedRes = resourceService.engine.resourceManager.getResourceById(regionId, resourceId);
    expect(reloadedRes).toBeDefined();
    expect(reloadedRes!.currentAmount).toBe(99.998);

    const reloadedCitizen = citizenService.engine.getCitizen(citizenId);
    expect(reloadedCitizen).toBeDefined();
    expect(reloadedCitizen!.wallet?.balance).toBe(9.90);

    const reloadedUtilityWallet = marketService.engine.getWallet(utilityWallet.ownerId);
    expect(reloadedUtilityWallet).toBeDefined();
    expect(reloadedUtilityWallet!.balance).toBe(0.10);
  });
});
