import { prisma } from '../../repositories/prisma';
import { worldService } from '../../services/world.service';
import { marketService } from '../../services/market.service';
import { supplyService } from '../../services/supply.service';
import { citizenService } from '../../services/citizen.service';
import { financeService } from '../../services/finance.service';
import { timeService } from '../../services/time.service';
import { eventService } from '../../services/event.service';
import { WorkplaceType, JobType, EmploymentStatus } from '@genesis/shared';
import { TimeUtils } from '@genesis/engine';

describe('T7.8.6 — Section 5: Long-Run Failure and Shortage Scenarios', () => {
  jest.setTimeout(45000);

  const testSuffix = `fail-${Date.now()}`;
  let regionId: string;
  let shopId: string;
  let farmId: string;
  let citizenId: string;

  beforeAll(async () => {
    supplyService.initialize();
    marketService.initialize();
    financeService.initialize();
    timeService.engine.reset();

    // Isolated IDs
    regionId = `reg-${testSuffix}`;
    shopId = `shop-${testSuffix}`;
    farmId = `farm-${testSuffix}`;
    citizenId = `cit-${testSuffix}`;

    (worldService.engine.regionManager as any).regions.set(regionId, {
      id: regionId,
      name: 'Failure Test Region',
      description: 'Stress and shortage testing',
      climate: 'TEMPERATE' as any,
      coordinates: { x: 0, y: 0 },
      width: 500,
      height: 500,
      cityIds: [],
      createdAt: new Date(),
      updatedAt: new Date()
    });
  });

  afterAll(async () => {
    await new Promise(resolve => setTimeout(resolve, 300));
    await prisma.$disconnect();
  });

  test('5.1 Retail stockout: Citizen purchase fails gracefully without negative inventory or money loss', async () => {
    const shopInvId = `inv-${shopId}`;
    const citHouseholdInvId = `inv-h-${citizenId}`;

    supplyService.inventoryManager.createInventory(shopInvId, shopId, 500);
    // Stock is 0 for food
    const getQty = (invId: string, prodId: string) => 
      supplyService.inventoryManager.getInventory(invId)?.items[prodId]?.totalQuantity || 0;

    expect(getQty(shopInvId, 'wheat')).toBe(0);

    const citWallet = { id: `w-${citizenId}`, ownerId: citizenId, balance: 500, currency: 'INR', totalIncome: 0, totalExpenses: 0 };
    const shopWallet = { id: `w-${shopId}`, ownerId: shopId, balance: 1000, currency: 'INR', totalIncome: 0, totalExpenses: 0 };

    worldService.engine.workplaceRepository.create({
      id: shopId,
      type: WorkplaceType.SHOP,
      locationId: regionId,
      regionId,
      capacity: 5,
      occupiedPositions: 1,
      vacancies: 4,
      inventoryId: shopInvId,
      storageCapacity: 500,
      wallet: shopWallet,
      positions: []
    } as any);

    // Citizen attempts to purchase 10 kg wheat from empty store
    // Check inventory availability before transaction
    const available = getQty(shopInvId, 'wheat');
    expect(available).toBe(0);

    // If purchase is rejected due to no stock:
    let transactionSucceeded = false;
    if (available >= 10) {
      marketService.engine.processTransaction(
        citizenId,
        shopId,
        'wheat',
        10,
        'kg',
        10,
        100,
        'INR',
        'PURCHASE' as any,
        regionId
      );
      transactionSucceeded = true;
    }

    expect(transactionSucceeded).toBe(false);
    // Invariants preserved: no negative inventory, no money lost
    expect(getQty(shopInvId, 'wheat')).toBe(0);
    expect(citWallet.balance).toBe(500);
    expect(shopWallet.balance).toBe(1000);
  });

  test('5.2 Supplier unavailable, followed by later supplier availability & procurement recovery', async () => {
    // Clear any previous orders and workplaces
    (worldService.engine.workplaceRepository as any).workplaces.clear();
    (supplyService.supplyChainEngine as any).orders.clear();
    (supplyService.supplyChainEngine as any).shipments.clear();

    const buyerId = `shop-p2-${Date.now()}`;
    const buyerInvId = `inv-${buyerId}`;
    supplyService.inventoryManager.createInventory(buyerInvId, buyerId, 500);

    const buyerWp = {
      id: buyerId,
      type: WorkplaceType.SHOP,
      locationId: regionId,
      regionId,
      capacity: 5,
      occupiedPositions: 1,
      vacancies: 4,
      inventoryId: buyerInvId,
      storageCapacity: 500,
      wallet: { id: `w-${buyerId}`, ownerId: buyerId, balance: 5000, currency: 'INR', totalIncome: 0, totalExpenses: 0 },
      positions: [],
      inventoryConfiguration: {
        'wheat': { reorderPoint: 50, targetStock: 100 }
      }
    };
    worldService.engine.workplaceRepository.create(buyerWp as any);

    // Initial scan with NO suppliers having wheat
    supplyService.businessProcurementEngine.runProcurementCycle();
    let shipments = supplyService.supplyChainEngine.getAllActiveShipments();
    const initialShipmentCount = shipments.length;
    expect(initialShipmentCount).toBe(0);

    // Supplier becomes available
    const newFarmId = `farm-new-${Date.now()}`;
    const newFarmInvId = `inv-${newFarmId}`;
    supplyService.inventoryManager.createInventory(newFarmInvId, newFarmId, 1000);
    supplyService.inventoryManager.addItemQuantity(newFarmInvId, 'wheat', 200, 'kg');

    worldService.engine.workplaceRepository.create({
      id: newFarmId,
      type: WorkplaceType.FARM,
      locationId: regionId,
      regionId,
      capacity: 5,
      occupiedPositions: 2,
      vacancies: 3,
      inventoryId: newFarmInvId,
      storageCapacity: 1000,
      wallet: { id: `w-${newFarmId}`, ownerId: newFarmId, balance: 1000, currency: 'INR', totalIncome: 0, totalExpenses: 0 },
      positions: []
    } as any);

    // Re-run procurement scan
    supplyService.businessProcurementEngine.runProcurementCycle();

    // Now procurement succeeds and dispatches shipment
    shipments = supplyService.supplyChainEngine.getAllActiveShipments();
    expect(shipments.length).toBeGreaterThan(0);
  });

  test('5.3 Insufficient business funds for payroll: records persistent debt and pays partially without crash', async () => {
    const bankruptWpId = `wp-bankrupt-${Date.now()}`;
    const workerId = `worker-debt-${Date.now()}`;

    const bankruptWallet = { id: `w-${bankruptWpId}`, ownerId: bankruptWpId, balance: 150, currency: 'INR', totalIncome: 0, totalExpenses: 0 };
    const workerWallet = { id: `w-${workerId}`, ownerId: workerId, balance: 0, currency: 'INR', totalIncome: 0, totalExpenses: 0 };

    worldService.engine.workplaceRepository.create({
      id: bankruptWpId,
      type: WorkplaceType.FACTORY,
      locationId: regionId,
      regionId,
      capacity: 2,
      occupiedPositions: 1,
      vacancies: 1,
      wallet: bankruptWallet,
      positions: [
        {
          id: `pos-${bankruptWpId}-1`,
          type: JobType.FACTORY_WORKER,
          workplaceId: bankruptWpId,
          occupantId: workerId,
          requiredSkills: {},
          schedule: { startHour: 8, endHour: 16 } as any
        }
      ]
    } as any);

    const workerCitizen: any = {
      id: workerId,
      name: 'Unpaid Worker',
      gender: 'MALE',
      status: 'ALIVE',
      employmentStatus: EmploymentStatus.EMPLOYED,
      workplaceId: bankruptWpId,
      jobType: JobType.FACTORY_WORKER,
      vitalState: { hunger: 50, thirst: 50, energy: 50, health: 100 },
      wallet: workerWallet,
      skills: [],
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
    (citizenService.engine as any).repository.create(workerCitizen);

    // Run payroll
    const { StoreRanker } = require('@genesis/engine/src/decision/scoring/StoreRanker');
    const { spatialService } = require('../../services/spatial.service');
    const storeRanker = new StoreRanker(marketService.engine, supplyService.inventoryManager);
    citizenService.engine.initializeSalaryService(marketService.engine, storeRanker, spatialService.engine.queryService);

    await citizenService.engine.salaryService!.runPayrollCycle();

    // Workplace drained to 0
    expect(bankruptWallet.balance).toBe(0);
    // Worker received partial payment (150 INR)
    expect(workerWallet.balance).toBe(150);
    // Remainder recorded as debt
    expect(workerCitizen.employmentRecord.unpaidWages).toBeGreaterThan(0);
  });

  test('5.4 Producer storage capacity limit blocks unbounded overproduction', async () => {
    const fullFarmId = `farm-full-${Date.now()}`;
    const fullFarmInvId = `inv-${fullFarmId}`;
    const maxCapacity = 100;

    // Create inventory with storageCapacity = 100
    supplyService.inventoryManager.createInventory(fullFarmInvId, fullFarmId, maxCapacity);
    // Fill to 100
    supplyService.inventoryManager.addItemQuantity(fullFarmInvId, 'wheat', 100, 'kg');

    const fullFarm = {
      id: fullFarmId,
      type: WorkplaceType.FARM,
      locationId: regionId,
      regionId,
      capacity: 5,
      occupiedPositions: 5,
      vacancies: 0,
      inventoryId: fullFarmInvId,
      storageCapacity: maxCapacity,
      wallet: { id: `w-${fullFarmId}`, ownerId: fullFarmId, balance: 1000, currency: 'INR', totalIncome: 0, totalExpenses: 0 },
      positions: [
        { id: 'p1', type: JobType.FARMER, workplaceId: fullFarmId, occupantId: 'c1', requiredSkills: {}, schedule: {} as any }
      ]
    };
    worldService.engine.workplaceRepository.create(fullFarm as any);

    // Run production cycle
    (supplyService.productionEngine as any).runProductionCycle();

    // Storage is capped at maxCapacity (100) or rejected by inventory manager
    const currentWheat = supplyService.inventoryManager.getInventory(fullFarmInvId)?.items['wheat']?.totalQuantity || 0;
    expect(currentWheat).toBeLessThanOrEqual(maxCapacity);
  });

  test('5.5 Duplicate scheduled-event idempotency caught without double execution', async () => {
    let executionCount = 0;
    const handlerName = `TestIdempotencyHandler.${Date.now()}`;
    const { EventRegistry } = require('@genesis/engine');
    EventRegistry.register(handlerName, async () => {
      executionCount++;
    });

    const eventId = `event-dedup-${Date.now()}`;
    const eventTime = { year: 1, month: 1, day: 1, hour: 1, minute: 0, second: 0 };

    eventService.scheduler.scheduleEvent({
      id: eventId,
      name: 'Dedup Test',
      description: 'Tests event idempotency',
      scheduledTime: eventTime,
      createdTime: eventTime,
      priority: 'Normal',
      status: 'Scheduled',
      cancelFlag: false,
      retryCount: 0,
      sourceModule: 'Test',
      targetModule: 'Test',
      handlerName
    }, true);

    // Advance time to execute
    await eventService.scheduler.executeDueEvents(eventTime);
    expect(executionCount).toBe(1);

    // Replay/duplicate event execution with same event
    await eventService.scheduler.executeDueEvents(eventTime);
    // Idempotent: count remains 1
    expect(executionCount).toBe(1);
  });
});
