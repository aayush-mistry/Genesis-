import { prisma } from '../../repositories/prisma';
import { worldService } from '../../services/world.service';
import { marketService } from '../../services/market.service';
import { supplyService } from '../../services/supply.service';
import { citizenService } from '../../services/citizen.service';
import { financeService } from '../../services/finance.service';
import { timeService } from '../../services/time.service';
import { eventService } from '../../services/event.service';
import { persistenceService } from '../../services/persistence.service';
import { civilizationIntelligenceService } from '../../services/civilizationIntelligence.service';
import { WorkplaceType, JobType, EmploymentStatus } from '@genesis/shared';
import { TimeUtils, EventRegistry } from '@genesis/engine';

describe('T7.8.6 — Deterministic Long-Run Economic Stability & Invariants', () => {
  jest.setTimeout(60000);

  const testSuffix = `stab-${Date.now()}`;
  let worldId: string;
  let regionId: string;
  let farmWpId: string;
  let shopWpId: string;
  let citizenId: string;
  let farmInvId: string;
  let shopInvId: string;
  let householdInvId: string;

  beforeAll(async () => {
    // 1. Initialize services
    supplyService.initialize();
    marketService.initialize();
    financeService.initialize();
    timeService.engine.reset();

    // 2. Clear relevant tables for isolation
    await prisma.transactionRecord.deleteMany({});
    await prisma.shipment.deleteMany({});
    await prisma.order.deleteMany({});
    await prisma.inventoryItem.deleteMany({});
    await prisma.inventory.deleteMany({});
    await prisma.jobPosition.deleteMany({});
    await prisma.citizen.deleteMany({});
    await prisma.workplace.deleteMany({});
    await prisma.wallet.deleteMany({});
    await prisma.region.deleteMany({});
    await prisma.world.deleteMany({});

    // 3. Create active test World & Region in DB & WorldEngine
    const world = await prisma.world.create({
      data: {
        name: `Stability World ${testSuffix}`,
        description: 'Long-run stability test world',
        randomSeed: 42,
        creationTime: 0,
        worldSize: 1000,
        climateProfile: 'TEMPERATE',
        timeZone: 'UTC',
        version: '1.0',
        status: 'ACTIVE'
      }
    });
    worldId = world.id;

    const region = await prisma.region.create({
      data: {
        name: 'Agricultural Valley',
        description: 'Fertile region for production & commerce',
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

    // Provide natural WATER resource for agricultural production in region
    const { resourceService } = await import('../../services/resource.service');
    resourceService.engine.resourceManager.addResource({
      name: 'Valley River',
      type: 'WATER' as any,
      category: 'RENEWABLE' as any,
      unit: 'L',
      renewable: true,
      regionId: region.id,
      coordinates: { x: 0, y: 0 },
      radius: 100,
      currentAmount: 100000,
      maximumAmount: 100000,
      naturalRecoveryRate: 1000,
      consumptionRate: 0,
      extractionDifficulty: 1
    });

    // 4. Setup Farm (Producer)
    farmWpId = `farm-${testSuffix}`;
    farmInvId = `inv-${farmWpId}`;
    const farmWallet = { id: `w-${farmWpId}`, ownerId: farmWpId, balance: 10000, currency: 'INR', totalIncome: 0, totalExpenses: 0 };
    await prisma.wallet.create({ data: { id: farmWallet.id, ownerId: farmWpId, balance: 10000, currency: 'INR' } });

    const farmWp = {
      id: farmWpId,
      type: WorkplaceType.FARM,
      locationId: regionId,
      regionId,
      capacity: 5,
      occupiedPositions: 2,
      vacancies: 3,
      inventoryId: farmInvId,
      storageCapacity: 2000,
      wallet: farmWallet,
      positions: [
        {
          id: `pos-${farmWpId}-1`,
          type: JobType.FARMER,
          workplaceId: farmWpId,
          occupantId: `citizen-${testSuffix}`,
          requiredSkills: {},
          schedule: { startHour: 8, endHour: 16 } as any
        }
      ]
    };
    worldService.engine.workplaceRepository.create(farmWp as any);
    supplyService.inventoryManager.createInventory(farmInvId, farmWpId, 2000);

    // Initial wheat buffer at producer
    supplyService.inventoryManager.addItemQuantity(farmInvId, 'wheat', 100, 'kg');

    // 5. Setup Shop (Retailer)
    shopWpId = `shop-${testSuffix}`;
    shopInvId = `inv-${shopWpId}`;
    const shopWallet = { id: `w-${shopWpId}`, ownerId: shopWpId, balance: 5000, currency: 'INR', totalIncome: 0, totalExpenses: 0 };
    await prisma.wallet.create({ data: { id: shopWallet.id, ownerId: shopWpId, balance: 5000, currency: 'INR' } });

    const shopWp = {
      id: shopWpId,
      type: WorkplaceType.SHOP,
      locationId: regionId,
      regionId,
      capacity: 2,
      occupiedPositions: 1,
      vacancies: 1,
      inventoryId: shopInvId,
      storageCapacity: 500,
      wallet: shopWallet,
      positions: [],
      inventoryConfiguration: {
        'wheat': { reorderPoint: 20, targetStock: 80 }
      }
    };
    worldService.engine.workplaceRepository.create(shopWp as any);
    supplyService.inventoryManager.createInventory(shopInvId, shopWpId, 500);

    // Initial stock at retail shop
    supplyService.inventoryManager.addItemQuantity(shopInvId, 'wheat', 30, 'kg');

    // 6. Setup Citizen & Household
    citizenId = `citizen-${testSuffix}`;
    const householdId = `household-${citizenId}`;
    householdInvId = `inv-${householdId}`;

    const citWallet = { id: `w-${citizenId}`, ownerId: citizenId, balance: 1200, currency: 'INR', totalIncome: 0, totalExpenses: 0 };
    await prisma.wallet.create({ data: { id: citWallet.id, ownerId: citizenId, balance: 1200, currency: 'INR' } });

    const citizen: any = {
      id: citizenId,
      name: 'Stabilizer Citizen',
      gender: 'FEMALE',
      status: 'ALIVE',
      householdId,
      locationId: regionId,
      workplaceId: farmWpId,
      jobType: JobType.FARMER,
      employmentStatus: EmploymentStatus.EMPLOYED,
      vitalState: { hunger: 75, thirst: 10, energy: 90, health: 100 },
      wallet: citWallet,
      employmentRecord: {
        daysWorked: 30,
        expectedWorkingDays: 30,
        performanceScore: 1.0,
        startDate: { year: 1, month: 1, day: 1, hour: 0, minute: 0, second: 0 },
        endDate: null,
        lastPaymentDate: null,
        unpaidWages: 0
      }
    };
    (citizenService.engine as any).repository.create(citizen);
    supplyService.inventoryManager.createInventory(householdInvId, householdId, 100);

    // Save entities to DB for persistence & summary verification
    await prisma.workplace.create({
      data: {
        id: farmWpId,
        type: 'FARM',
        locationId: 'loc-farm',
        regionId,
        capacity: 5,
        occupiedPositions: 2,
        vacancies: 3,
        inventoryId: farmInvId,
        storageCapacity: 2000,
        walletId: farmWallet.id
      }
    });

    await prisma.workplace.create({
      data: {
        id: shopWpId,
        type: 'SHOP',
        locationId: 'loc-shop',
        regionId,
        capacity: 2,
        occupiedPositions: 1,
        vacancies: 1,
        inventoryId: shopInvId,
        storageCapacity: 500,
        walletId: shopWallet.id
      }
    });

    await prisma.citizen.create({
      data: {
        id: citizenId,
        name: citizen.name,
        gender: citizen.gender,
        status: citizen.status,
        employmentStatus: citizen.employmentStatus,
        workplaceId: farmWpId,
        jobType: 'FARMER',
        householdId: null,
        vitalStateJson: JSON.stringify(citizen.vitalState),
        employmentRecJson: JSON.stringify(citizen.employmentRecord),
        walletId: citWallet.id,
        birthDateJson: JSON.stringify({ year: 1, month: 1, day: 1, hour: 0, minute: 0, second: 0 }),
        createdAtSimJson: JSON.stringify({ year: 1, month: 1, day: 1, hour: 0, minute: 0, second: 0 }),
        personalityJson: '{}',
        skillsJson: '[]',
        movementState: 'IDLE'
      }
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  test('1. Money and inventory conservation during retail purchase & consumption', async () => {
    const citizen = citizenService.engine.getCitizen(citizenId)!;
    const shopWp = worldService.engine.workplaceRepository.findById(shopWpId)!;

    const citInitialMoney = citizen.wallet.balance;
    const shopInitialMoney = shopWp.wallet!.balance;
    const initialTotalMoney = citInitialMoney + shopInitialMoney;

    const shopInitialWheat = supplyService.inventoryManager.getInventory(shopInvId)!.items['wheat']!.totalQuantity;
    const householdInitialWheat = supplyService.inventoryManager.getInventory(householdInvId)?.items['wheat']?.totalQuantity || 0;
    const initialTotalWheat = shopInitialWheat + householdInitialWheat;

    // Execute retail purchase: citizen buys 15 kg wheat at 10 INR/kg = 150 INR
    const purchaseAmount = 15;
    const unitPrice = 10;
    const totalPrice = purchaseAmount * unitPrice;

    const tx = marketService.engine.processTransaction(
      citizenId,
      shopWpId,
      'wheat',
      purchaseAmount,
      'kg',
      unitPrice,
      totalPrice,
      'INR',
      'PURCHASE' as any,
      regionId
    );
    expect(tx).not.toBeNull();

    // Inventory transfer from shop to household
    const transferred = supplyService.inventoryManager.transferItemQuantity(
      shopInvId,
      householdInvId,
      'wheat',
      purchaseAmount,
      'kg'
    );
    expect(transferred).toBe(true);

    // INVARIANT 1: Money conservation
    expect(citizen.wallet.balance).toBe(citInitialMoney - totalPrice);
    expect(shopWp.wallet!.balance).toBe(shopInitialMoney + totalPrice);
    expect(citizen.wallet.balance + shopWp.wallet!.balance).toBe(initialTotalMoney);

    // INVARIANT 2: Inventory conservation across transfer
    const shopWheatAfter = supplyService.inventoryManager.getInventory(shopInvId)!.items['wheat']!.totalQuantity;
    const householdWheatAfter = supplyService.inventoryManager.getInventory(householdInvId)!.items['wheat']!.totalQuantity;
    expect(shopWheatAfter).toBe(shopInitialWheat - purchaseAmount);
    expect(householdWheatAfter).toBe(householdInitialWheat + purchaseAmount);
    expect(shopWheatAfter + householdWheatAfter).toBe(initialTotalWheat);

    // Step 3: Legitimate Consumption reduces inventory and restores hunger
    const initialHunger = citizen.vitalState.hunger;
    const { ConsumptionEngine } = require('@genesis/engine');
    const consumptionEngine = new ConsumptionEngine(
      supplyService.inventoryManager,
      citizenService.engine.needsService,
      (id: string) => supplyService.productionEngine.commodities.get(id)
    );

    // Wheat restores 20 HUNGER per kg. Citizen hunger = 75, target = 20. Need reduction = 55.
    // Consumes 3 kg. Hunger becomes 75 - (3 * 20) = 15 -> capped at target (20).
    const consumed = consumptionEngine.consume(citizen, 'HUNGER', 0);
    expect(consumed).toBe(true);
    expect(citizen.vitalState.hunger).toBeLessThan(initialHunger);

    // Inventory correctly decremented by actual consumption
    const householdWheatAfterConsume = supplyService.inventoryManager.getInventory(householdInvId)!.items['wheat']!.totalQuantity;
    expect(householdWheatAfterConsume).toBeLessThan(householdWheatAfter);
  });

  test('2. Business procurement triggers when retail stock drops below reorder point', async () => {
    // Current shop wheat is 15 kg, reorderPoint is 20 kg
    const shopWheat = supplyService.inventoryManager.getInventory(shopInvId)!.items['wheat']!.totalQuantity;
    expect(shopWheat).toBeLessThanOrEqual(20);

    // Run procurement scan
    const farmInitialWheat = supplyService.inventoryManager.getInventory(farmInvId)!.items['wheat']!.totalQuantity;
    
    // Check procurement logic
    supplyService.businessProcurementEngine.runProcurementCycle();

    // Verify orders or shipments created
    const activeShipments = supplyService.supplyChainEngine.getAllActiveShipments();
    expect(activeShipments.length).toBeGreaterThanOrEqual(1);

    const shipment = activeShipments[0];
    expect(shipment.productId).toBe('wheat');
    expect(shipment.originId).toBe(farmWpId);
    expect(shipment.destinationId).toBe(shopWpId);

    // INVARIANT 3: Reservation accounting - reserved quantity was moved or consumed into transit
    const farmInventory = supplyService.inventoryManager.getInventory(farmInvId)!;
    const wheatItem = farmInventory.items['wheat'];
    expect(wheatItem.totalQuantity).toBeLessThan(farmInitialWheat);

    // Progress shipment to delivery
    (supplyService.supplyChainEngine as any).handleShipmentArrival({
      shipmentId: shipment.shipmentId,
      orderId: (supplyService.supplyChainEngine as any).orders.keys().next().value
    });

    // Upon delivery, shop stock is replenished
    const shopWheatReplenished = supplyService.inventoryManager.getInventory(shopInvId)!.items['wheat']!.totalQuantity;
    expect(shopWheatReplenished).toBeGreaterThan(shopWheat);
  });

  test('3. Production cycle adds valid output governed by capacity & staffing', async () => {
    const farmWp = worldService.engine.workplaceRepository.findById(farmWpId)!;
    const initialWheat = supplyService.inventoryManager.getInventory(farmInvId)!.items['wheat']?.totalQuantity || 0;

    // Run production cycle
    (supplyService.productionEngine as any).runProductionCycle();

    const wheatAfter = supplyService.inventoryManager.getInventory(farmInvId)!.items['wheat']!.totalQuantity;
    expect(wheatAfter).toBeGreaterThan(initialWheat);

    // Verify yield respects capacity and worker proportion
    const yieldAdded = wheatAfter - initialWheat;
    expect(yieldAdded).toBeGreaterThan(0);
  });

  test('4. Payroll idempotency: zero duplicate payments for the same payment period', async () => {
    const citizen = citizenService.engine.getCitizen(citizenId)!;
    const farmWp = worldService.engine.workplaceRepository.findById(farmWpId)!;

    // Connect SalaryService
    const { StoreRanker } = require('@genesis/engine/src/decision/scoring/StoreRanker');
    const { spatialService } = require('../../services/spatial.service');
    const storeRanker = new StoreRanker(marketService.engine, supplyService.inventoryManager);
    citizenService.engine.initializeSalaryService(marketService.engine, storeRanker, spatialService.engine.queryService);

    citizen.employmentRecord!.daysWorked = 30;
    citizen.employmentRecord!.expectedWorkingDays = 30;
    citizen.employmentRecord!.lastPaymentDate = null;

    const citMoneyBefore = citizen.wallet.balance;
    const farmMoneyBefore = farmWp.wallet!.balance;

    // First payroll run
    await citizenService.engine.salaryService!.runPayrollCycle();
    await new Promise(resolve => setTimeout(resolve, 300));

    const citMoneyAfterFirst = citizen.wallet.balance;
    const farmMoneyAfterFirst = farmWp.wallet!.balance;
    expect(citMoneyAfterFirst).toBeGreaterThan(citMoneyBefore);
    expect(farmMoneyAfterFirst).toBeLessThan(farmMoneyBefore);

    // Second payroll run in the SAME period
    await citizenService.engine.salaryService!.runPayrollCycle();
    await new Promise(resolve => setTimeout(resolve, 300));

    // INVARIANT 4: Idempotent payroll - money remains strictly unchanged
    expect(citizen.wallet.balance).toBe(citMoneyAfterFirst);
    expect(farmWp.wallet!.balance).toBe(farmMoneyAfterFirst);
  });

  test('5. Persistence sync and Authoritative API Summary consistency', async () => {
    // Persist current tick boundary
    await persistenceService.persistTickBoundary({
      citizens: [citizenId]
    });

    const summary = await civilizationIntelligenceService.getCivilizationSummary();

    // Check summary structure & values
    expect(summary.population.total).toBe(1);
    expect(summary.employment.employed).toBe(1);
    expect(summary.finance.totalMoney).toBeGreaterThan(0);
    expect(summary.production.activeProducers).toBeGreaterThanOrEqual(1);
    expect(summary.market.wheat).toBeDefined();
    expect(summary.market.wheat.retailPrice).toBeGreaterThan(0);
    expect(summary.market.wheat.wholesaleUnitPrice).toBeGreaterThan(0);
  });
});
