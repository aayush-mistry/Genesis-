import { prisma } from '../../repositories/prisma';
import { consumptionRepository } from '../../repositories/ConsumptionRepository';
import { consumptionService } from '../consumption.service';
import { supplyService } from '../supply.service';
import { timeService } from '../time.service';
import { worldService } from '../world.service';
import { citizenService } from '../citizen.service';
import { marketService } from '../market.service';
import { financeService } from '../finance.service';
import { spatialService } from '../spatial.service';
import { ConsumptionEngine, TimeUtils } from '@genesis/engine';
import { WorkplaceType } from '@genesis/shared';

describe('T8.2 — Consumption History, Demand Forecasting & Procurement Integration', () => {
  jest.setTimeout(40000);

  const testSuffix = `t82-${Date.now()}`;
  let regionId: string;
  let buyerId: string;
  let sellerId: string;
  let householdId: string;
  let citizenId: string;
  let householdInvId: string;
  let storeInvId: string;

  beforeAll(async () => {
    // 1. Initialize backend engines
    supplyService.initialize();
    marketService.initialize();
    financeService.initialize();
    consumptionService.initialize();
    timeService.engine.reset();

    jest.spyOn(spatialService.engine.queryService, 'calculateRoute').mockReturnValue({ distance: 10, path: [] } as any);

    // 2. Clear relevant tables for isolation
    await prisma.consumptionRecord.deleteMany({});
    await prisma.transactionRecord.deleteMany({});
    await prisma.shipment.deleteMany({});
    await prisma.order.deleteMany({});
    await prisma.inventoryItem.deleteMany({});
    await prisma.inventory.deleteMany({});
    await prisma.citizen.deleteMany({});
    await prisma.household.deleteMany({});
    await prisma.workplace.deleteMany({});
    await prisma.wallet.deleteMany({});
    await prisma.region.deleteMany({});
    await prisma.world.deleteMany({});

    // 3. Create isolated test world and region
    const world = await prisma.world.create({
      data: {
        name: `World ${testSuffix}`,
        description: 'Testing T8.2 forecasting and ledger',
        randomSeed: 1234,
        creationTime: 0,
        worldSize: 1000,
        climateProfile: 'TEMPERATE',
        timeZone: 'UTC',
        version: '1.0',
        status: 'ACTIVE'
      }
    });

    const region = await prisma.region.create({
      data: {
        name: `Region ${testSuffix}`,
        description: 'Test region',
        climate: 'TEMPERATE',
        coordX: 0,
        coordY: 0,
        worldId: world.id
      }
    });
    regionId = region.id;

    // Load into WorldEngine
    worldService.engine.worldManager.loadWorld({
      id: world.id,
      name: world.name,
      description: world.description,
      seed: world.randomSeed,
      creationTime: world.creationTime,
      width: 1000,
      height: 1000,
      regionIds: [region.id]
    } as any);

    (worldService.engine.regionManager as any).regions.set(region.id, {
      id: region.id,
      name: region.name,
      description: region.description,
      climate: region.climate as any,
      coordinates: { x: 0, y: 0 },
      width: 500,
      height: 500,
      cityIds: [],
      createdAt: new Date(),
      updatedAt: new Date()
    });

    // 4. Setup Citizen & Household for consumption
    householdId = `hh-${testSuffix}`;
    citizenId = `cit-${testSuffix}`;
    householdInvId = `inv-hh-${testSuffix}`;

    supplyService.inventoryManager.createInventory(householdInvId, householdId, 500);

    const citizen: any = {
      id: citizenId,
      name: 'Test Citizen',
      gender: 'MALE',
      status: 'ACTIVE',
      birthDate: { year: 1, month: 1, day: 1, hour: 0, minute: 0, second: 0 },
      createdAt: { year: 1, month: 1, day: 1, hour: 0, minute: 0, second: 0 },
      locationId: 'loc-1',
      householdId,
      vitalState: { hunger: 80, thirst: 70, health: 100, energy: 100 },
      wallet: { id: `w-${citizenId}`, ownerId: citizenId, balance: 500, currency: 'CREDIT', totalIncome: 0, totalExpenses: 0 },
      personality: {},
      skills: [],
      employmentStatus: 'UNEMPLOYED'
    };

    (citizenService.engine as any).repository.create(citizen);
    citizenService.engine.householdService.registerHousehold({
      id: householdId,
      locationId: 'loc-1',
      inventoryId: householdInvId,
      walletId: `w-${householdId}`,
      members: [citizenId]
    });

    // 5. Setup Buyer Shop and Seller Wholesale for procurement
    buyerId = `shop-${testSuffix}`;
    sellerId = `wholesale-${testSuffix}`;
    storeInvId = `inv-${buyerId}`;
    const sellerInvId = `inv-${sellerId}`;

    supplyService.inventoryManager.createInventory(storeInvId, buyerId, 1000);
    supplyService.inventoryManager.createInventory(sellerInvId, sellerId, 5000);

    worldService.engine.workplaceRepository.create({
      id: buyerId,
      type: WorkplaceType.SHOP,
      regionId,
      locationId: 'loc-shop',
      capacity: 10,
      occupiedPositions: 1,
      vacancies: 9,
      positions: [],
      inventoryId: storeInvId,
      storageCapacity: 1000,
      wallet: { id: `w-${buyerId}`, ownerId: buyerId, balance: 10000, currency: 'CREDIT', totalIncome: 0, totalExpenses: 0 },
      inventoryConfiguration: {
        'wheat': { reorderPoint: 50, targetStock: 200 }
      }
    });

    worldService.engine.workplaceRepository.create({
      id: sellerId,
      type: WorkplaceType.WHOLESALE,
      regionId,
      locationId: 'loc-wholesale',
      capacity: 10,
      occupiedPositions: 2,
      vacancies: 8,
      positions: [],
      inventoryId: sellerInvId,
      storageCapacity: 5000,
      wallet: { id: `w-${sellerId}`, ownerId: sellerId, balance: 1000, currency: 'CREDIT', totalIncome: 0, totalExpenses: 0 }
    });

    // Stock wholesale supplier with wheat
    supplyService.inventoryManager.addItemQuantity(sellerInvId, 'wheat', 1000, 'kg');
  });

  afterAll(async () => {
    await prisma.consumptionRecord.deleteMany({});
    await prisma.transactionRecord.deleteMany({});
    await prisma.shipment.deleteMany({});
    await prisma.order.deleteMany({});
    await prisma.inventoryItem.deleteMany({});
    await prisma.inventory.deleteMany({});
    await prisma.citizen.deleteMany({});
    await prisma.household.deleteMany({});
    await prisma.workplace.deleteMany({});
    await prisma.wallet.deleteMany({});
    await prisma.region.deleteMany({});
    await prisma.world.deleteMany({});
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    consumptionService.consumptionLedger.clear();
    await prisma.consumptionRecord.deleteMany({});
  });

  it('1. Successful consumption creates exactly one persistent ledger record', async () => {
    await prisma.consumptionRecord.deleteMany({});

    // Add 10 kg wheat to household inventory
    supplyService.inventoryManager.addItemQuantity(householdInvId, 'wheat', 10, 'kg', 0, 500000);

    const citizen = citizenService.engine.getCitizen(citizenId)!;
    citizen.vitalState.hunger = 80;

    const consumptionEngine = new ConsumptionEngine(
      supplyService.inventoryManager,
      citizenService.engine.needsService,
      (id) => supplyService.productionEngine.commodities.get(id),
      consumptionService.consumptionLedger
    );

    const eventId = `eat-event-${Date.now()}`;
    const simTime = 86400; // Day 2

    // Citizen eats: Required restoration 80 - 20 = 60. Wheat restoration = 20. Need: 3 kg.
    const success = consumptionEngine.consume(citizen, 'HUNGER', simTime, 20, eventId, 'CITIZEN_NEED', regionId);
    expect(success).toBe(true);

    // In-memory ledger count
    expect(consumptionService.consumptionLedger.count()).toBe(1);
    const inMemRecord = consumptionService.consumptionLedger.getRecords()[0];
    expect(inMemRecord.eventId).toBe(eventId);
    expect(inMemRecord.commodityId).toBe('wheat');
    expect(inMemRecord.quantity).toBe(3);
    expect(inMemRecord.unit).toBe('kg');
    expect(inMemRecord.consumerId).toBe(citizenId);
    expect(inMemRecord.householdId).toBe(householdId);
    expect(inMemRecord.regionId).toBe(regionId);

    // Wait briefly for asynchronous Prisma listener to complete write
    await new Promise(r => setTimeout(r, 200));

    const dbRecord = await prisma.consumptionRecord.findUnique({
      where: { eventId }
    });

    expect(dbRecord).not.toBeNull();
    expect(dbRecord?.quantity).toBe(3);
    expect(dbRecord?.commodityId).toBe('wheat');
    expect(dbRecord?.unit).toBe('kg');
    expect(dbRecord?.consumerId).toBe(citizenId);
    expect(dbRecord?.householdId).toBe(householdId);
    expect(dbRecord?.regionId).toBe(regionId);
  });

  it('2. Failed consumption creates no record', async () => {
    const beforeCount = consumptionService.consumptionLedger.count();
    const beforeDbCount = await prisma.consumptionRecord.count();

    const citizen = citizenService.engine.getCitizen(citizenId)!;
    citizen.vitalState.thirst = 80;

    const consumptionEngine = new ConsumptionEngine(
      supplyService.inventoryManager,
      citizenService.engine.needsService,
      (id) => supplyService.productionEngine.commodities.get(id),
      consumptionService.consumptionLedger
    );

    // No water in household inventory
    const success = consumptionEngine.consume(citizen, 'THIRST', 86400, 20, 'fail-water-evt', 'CITIZEN_NEED', regionId);
    expect(success).toBe(false);

    expect(consumptionService.consumptionLedger.count()).toBe(beforeCount);
    const afterDbCount = await prisma.consumptionRecord.count();
    expect(afterDbCount).toBe(beforeDbCount);
  });

  it('3. Retrying the same event does not duplicate consumption history', async () => {
    supplyService.inventoryManager.addItemQuantity(householdInvId, 'wheat', 10, 'kg', 0, 500000);

    const citizen = citizenService.engine.getCitizen(citizenId)!;
    citizen.vitalState.hunger = 80;

    const consumptionEngine = new ConsumptionEngine(
      supplyService.inventoryManager,
      citizenService.engine.needsService,
      (id) => supplyService.productionEngine.commodities.get(id),
      consumptionService.consumptionLedger
    );

    const retryEventId = `retry-evt-${Date.now()}`;

    // 1st consumption
    const first = consumptionEngine.consume(citizen, 'HUNGER', 86400, 20, retryEventId, 'CITIZEN_NEED', regionId);
    expect(first).toBe(true);

    const countAfterFirst = consumptionService.consumptionLedger.count();

    // Reset hunger to trigger need again
    citizen.vitalState.hunger = 80;

    // 2nd consumption with identical eventId (retry scenario)
    consumptionEngine.consume(citizen, 'HUNGER', 86400, 20, retryEventId, 'CITIZEN_NEED', regionId);

    // Ledger must reject duplicate
    expect(consumptionService.consumptionLedger.count()).toBe(countAfterFirst);

    // Direct repository call with duplicate eventId
    const retryDb = await consumptionRepository.recordConsumption({
      eventId: retryEventId,
      timestamp: 86400,
      commodityId: 'wheat',
      quantity: 3,
      unit: 'kg',
      context: 'CITIZEN_NEED',
      regionId
    });

    expect(retryDb).not.toBeNull();
    const dbRecordsWithId = await prisma.consumptionRecord.findMany({
      where: { eventId: retryEventId }
    });
    expect(dbRecordsWithId.length).toBe(1);
  });

  it('4. Forecasts use actual historical consumption with correct units and windows', () => {
    // Populate 7 days of actual consumption: 15 kg/day of wheat
    const daySec = 86400;
    const currentSimSec = 7 * daySec;

    for (let day = 0; day < 7; day++) {
      consumptionService.consumptionLedger.record({
        eventId: `wheat-hist-${day}`,
        timestamp: day * daySec + 3600,
        commodityId: 'wheat',
        regionId,
        quantity: 15,
        unit: 'kg',
        context: 'CITIZEN_NEED'
      });
    }

    const forecast = consumptionService.forecastingEngine.forecast(
      'wheat',
      regionId,
      currentSimSec,
      { observationWindowDays: 7, forecastHorizonDays: 1, minObservationDays: 1 }
    );

    expect(forecast.dataSufficiency).toBe(true);
    expect(forecast.status).toBe('SUFFICIENT');
    expect(forecast.unit).toBe('kg');
    expect(forecast.observedConsumptionTotal).toBe(105); // 15 * 7
    expect(forecast.observedEventsCount).toBe(7);
    expect(forecast.dailyConsumptionRate).toBe(15);
    expect(forecast.forecastDemand).toBe(15);
  });

  it('5. Insufficient history is reported explicitly without fabricating data', () => {
    // Only 1 observation recorded 1 hour into the simulation
    consumptionService.consumptionLedger.record({
      eventId: 'raw-fish-new',
      timestamp: 3600,
      commodityId: 'raw_fish',
      regionId,
      quantity: 5,
      unit: 'kg',
      context: 'CITIZEN_NEED'
    });

    const forecast = consumptionService.forecastingEngine.forecast(
      'raw_fish',
      regionId,
      7200, // 2 hours in
      { observationWindowDays: 7, minObservationDays: 1 }
    );

    expect(forecast.dataSufficiency).toBe(false);
    expect(forecast.status).toBe('INSUFFICIENT_HISTORY');
    expect(forecast.forecastDemand).toBeNull();
    expect(forecast.dailyConsumptionRate).toBeNull();
    expect(forecast.explanation).toContain('requires at least 1 day(s) of history');
  });

  it('6. Different regions and commodities do not contaminate each other', () => {
    const daySec = 86400;
    const currentSimSec = 3 * daySec;

    // Region 1 wheat: 30 kg total
    consumptionService.consumptionLedger.record({
      eventId: 'r1-wheat',
      timestamp: 3600,
      commodityId: 'wheat',
      regionId,
      quantity: 30,
      unit: 'kg',
      context: 'CITIZEN_NEED'
    });

    // Foreign Region wheat: 90 kg total
    consumptionService.consumptionLedger.record({
      eventId: 'other-region-wheat',
      timestamp: 3600,
      commodityId: 'wheat',
      regionId: 'foreign-region',
      quantity: 90,
      unit: 'kg',
      context: 'CITIZEN_NEED'
    });

    // Region 1 water: 60 L total
    consumptionService.consumptionLedger.record({
      eventId: 'r1-water',
      timestamp: 3600,
      commodityId: 'water',
      regionId,
      quantity: 60,
      unit: 'L',
      context: 'CITIZEN_NEED'
    });

    const r1Wheat = consumptionService.forecastingEngine.forecast('wheat', regionId, currentSimSec, { observationWindowDays: 3, minObservationDays: 1 });
    const foreignWheat = consumptionService.forecastingEngine.forecast('wheat', 'foreign-region', currentSimSec, { observationWindowDays: 3, minObservationDays: 1 });
    const r1Water = consumptionService.forecastingEngine.forecast('water', regionId, currentSimSec, { observationWindowDays: 3, minObservationDays: 1 });

    expect(r1Wheat.observedConsumptionTotal).toBe(30);
    expect(r1Wheat.forecastDemand).toBe(10); // 30 / 3

    expect(foreignWheat.observedConsumptionTotal).toBe(90);
    expect(foreignWheat.forecastDemand).toBe(30); // 90 / 3

    expect(r1Water.observedConsumptionTotal).toBe(60);
    expect(r1Water.unit).toBe('L');
    expect(r1Water.forecastDemand).toBe(20); // 60 / 3
  });

  it('7. Inbound supply accounts for existing orders/shipments to prevent duplicate procurement', async () => {
    const shop = worldService.engine.workplaceRepository.findById(buyerId)!;
    shop.inventoryConfiguration = {
      'wheat': { reorderPoint: 50, targetStock: 200 }
    };

    const buyerInv = supplyService.inventoryManager.getInventory(storeInvId)!;
    // Set current stock to 55 (slightly above reorder point 50)
    buyerInv.items['wheat'] = {
      productId: 'wheat',
      totalQuantity: 55,
      reservedQuantity: 0,
      availableQuantity: 55,
      unit: 'kg',
      batches: []
    };

    // Populate historical consumption: 25 kg/day
    const daySec = 86400;
    timeService.engine.setCurrentTime({ year: 1, month: 1, day: 8, hour: 0, minute: 0, second: 0 });
    for (let day = 0; day < 7; day++) {
      consumptionService.consumptionLedger.record({
        eventId: `inbound-test-${day}`,
        timestamp: day * daySec + 3600,
        commodityId: 'wheat',
        regionId,
        quantity: 25,
        unit: 'kg',
        context: 'CITIZEN_NEED'
      });
    }

    // Connect forecaster to business procurement engine
    supplyService.businessProcurementEngine.setDemandForecaster(consumptionService.forecastingEngine);

    // Case A: With an inbound order of 100 kg already in transit
    const mockOrderSpy = jest.spyOn(supplyService.supplyChainEngine, 'getPendingIncomingQuantity').mockReturnValue(100);

    // Effective stock = 55 + 100 = 155 kg.
    // Projected stock = 155 - 25 forecast = 130 kg.
    // 130 kg > reorderPoint (50) -> NO procurement!
    supplyService.businessProcurementEngine.runProcurementCycle();

    const pendingAfterA = supplyService.businessProcurementEngine.getPendingRequirements()
      .filter(r => r.buyerId === buyerId);
    expect(pendingAfterA.length).toBe(0);

    mockOrderSpy.mockRestore();
  });

  it('8. Procurement reacts to projected shortage before stock runs out without creating free inventory', async () => {
    const buyerInv = supplyService.inventoryManager.getInventory(storeInvId)!;
    // Stock is 55 (above reorderPoint 50, but forecast will deplete it to 30)
    buyerInv.items['wheat'] = {
      productId: 'wheat',
      totalQuantity: 55,
      reservedQuantity: 0,
      availableQuantity: 55,
      unit: 'kg',
      batches: []
    };

    // Populate historical consumption: 25 kg/day for 7 days
    const daySec = 86400;
    timeService.engine.setCurrentTime({ year: 1, month: 1, day: 8, hour: 0, minute: 0, second: 0 });
    for (let day = 0; day < 7; day++) {
      consumptionService.consumptionLedger.record({
        eventId: `shortage-hist-${day}`,
        timestamp: day * daySec + 3600,
        commodityId: 'wheat',
        regionId,
        quantity: 25,
        unit: 'kg',
        context: 'CITIZEN_NEED'
      });
    }

    // Pending incoming = 0
    const pendingSpy = jest.spyOn(supplyService.supplyChainEngine, 'getPendingIncomingQuantity').mockReturnValue(0);

    // Daily consumption = 25 kg/day.
    // Projected available supply = 55 - 25 = 30 kg.
    // 30 kg < reorderPoint 50 -> SHORTAGE detected!
    const buyerWorkplace = worldService.engine.workplaceRepository.findById(buyerId)!;
    const initialBuyerBalance = buyerWorkplace.wallet!.balance;

    supplyService.businessProcurementEngine.runProcurementCycle();

    // Check that order was created through existing supply chain pipeline
    const buyerOrders = supplyService.supplyChainEngine.getOrdersForBusiness(buyerId);
    expect(buyerOrders.length).toBeGreaterThan(0);

    // Money was spent legitimately (no free inventory)
    expect(buyerWorkplace.wallet!.balance).toBeLessThan(initialBuyerBalance);

    pendingSpy.mockRestore();
  });

  it('9. Historical records and forecast behavior survive a cold restart', async () => {
    // 1. Persist known consumption records into SQLite via repository
    await new Promise(r => setTimeout(r, 100));
    await prisma.consumptionRecord.deleteMany({});
    const daySec = 86400;

    for (let day = 0; day < 5; day++) {
      await consumptionRepository.recordConsumption({
        eventId: `restart-hist-${day}`,
        timestamp: day * daySec + 1000,
        commodityId: 'wheat',
        regionId,
        quantity: 20,
        unit: 'kg',
        context: 'CITIZEN_NEED',
        simulationDay: day + 1,
        simulationHour: 0
      });
    }

    // 2. Clear in-memory ledger completely to simulate engine termination / memory wipe
    consumptionService.consumptionLedger.clear();
    expect(consumptionService.consumptionLedger.count()).toBe(0);

    // Forecast on empty memory yields NO_DATA
    const emptyForecast = consumptionService.forecastingEngine.forecast('wheat', regionId, 5 * daySec);
    expect(emptyForecast.status).toBe('NO_DATA');

    // 3. Simulate Cold Restart: hydrate from database
    const hydratedCount = await consumptionService.hydrateFromDatabase(regionId);
    expect(hydratedCount).toBe(5);
    expect(consumptionService.consumptionLedger.count()).toBe(5);

    // 4. Forecast after cold restart yields exact deterministic results
    const recoveredForecast = consumptionService.forecastingEngine.forecast('wheat', regionId, 5 * daySec, {
      observationWindowDays: 5,
      forecastHorizonDays: 1,
      minObservationDays: 1
    });

    expect(recoveredForecast.status).toBe('SUFFICIENT');
    expect(recoveredForecast.observedConsumptionTotal).toBe(100); // 5 * 20
    expect(recoveredForecast.dailyConsumptionRate).toBe(20);
    expect(recoveredForecast.forecastDemand).toBe(20);
  });

  it('10. Projected supply balance API distinguishes shortage, surplus, and unavailable history', async () => {
    // Add known stock
    const buyerInv = supplyService.inventoryManager.getInventory(storeInvId)!;
    buyerInv.items['wheat'] = {
      productId: 'wheat',
      totalQuantity: 100,
      reservedQuantity: 0,
      availableQuantity: 100,
      unit: 'kg',
      batches: []
    };

    // Populate 5 days of 20 kg/day wheat history
    const daySec = 86400;
    timeService.engine.setCurrentTime({ year: 1, month: 1, day: 6, hour: 0, minute: 0, second: 0 });
    for (let day = 0; day < 5; day++) {
      consumptionService.consumptionLedger.record({
        eventId: `bal-hist-${day}`,
        timestamp: day * daySec + 3600,
        commodityId: 'wheat',
        regionId,
        quantity: 20,
        unit: 'kg',
        context: 'CITIZEN_NEED'
      });
    }

    // Calculate balance with sufficient wheat history (20 kg/day)
    const wheatBalance = await consumptionService.getProjectedSupplyBalance('wheat', regionId, 1, 5);

    expect(wheatBalance.commodityId).toBe('wheat');
    expect(wheatBalance.forecast.status).toBe('SUFFICIENT');
    expect(wheatBalance.forecast.forecastDemand).toBe(20);
    expect(wheatBalance.supply.availableInventory).toBeGreaterThanOrEqual(100);
    expect(wheatBalance.analysis.condition).toBe('SURPLUS');
    expect(wheatBalance.analysis.projectedNet).toBeGreaterThan(0);

    // Calculate balance for commodity with NO history (timber)
    const timberBalance = await consumptionService.getProjectedSupplyBalance('timber', regionId, 1, 5);
    expect(timberBalance.commodityId).toBe('timber');
    expect(timberBalance.forecast.status).toBe('NO_DATA');
    expect(timberBalance.forecast.forecastDemand).toBeNull();
    expect(timberBalance.analysis.condition).toBe('UNAVAILABLE');
    expect(timberBalance.analysis.projectedNet).toBeNull();
  });
});
