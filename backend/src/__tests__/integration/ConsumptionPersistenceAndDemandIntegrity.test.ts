import { prisma } from '../../repositories/prisma';
import { consumptionRepository } from '../../repositories/ConsumptionRepository';
import { consumptionService } from '../../services/consumption.service';
import { civilizationDemandService } from '../../services/civilizationDemand.service';
import { persistenceService } from '../../services/persistence.service';
import { supplyService } from '../../services/supply.service';
import { timeService } from '../../services/time.service';
import { worldService } from '../../services/world.service';
import { citizenService } from '../../services/citizen.service';
import { CitizenStatus, EmploymentStatus, JobType, WorkplaceType, CitizenGender } from '@genesis/shared';
import { ConsumptionEngine, SalaryService, TimeUtils } from '@genesis/engine';

describe('Project Genesis — T8.6.5.4: Consumption Persistence & Demand Integrity', () => {
  jest.setTimeout(45000);

  const testSuffix = `t8654-${Date.now()}`;
  let worldId: string;
  let regionId: string;
  let householdId: string;
  let householdInvId: string;
  let storeInvId: string;
  let activeAdultId: string;
  let activeChildId: string;
  let deceasedCitizenId: string;

  beforeAll(async () => {
    supplyService.initialize();
    consumptionService.initialize();
    timeService.engine.reset();

    // Clean test database tables
    await prisma.consumptionRecord.deleteMany();
    await prisma.transactionRecord.deleteMany();
    await prisma.jobPosition.deleteMany();
    await prisma.citizen.deleteMany();
    await prisma.household.deleteMany();
    await prisma.inventoryItem.deleteMany();
    await prisma.inventory.deleteMany();
    await prisma.workplace.deleteMany();
    await prisma.wallet.deleteMany();
    await prisma.region.deleteMany();
    await prisma.world.deleteMany();

    // Create World and Region
    const world = await prisma.world.create({
      data: {
        name: `CP World ${testSuffix}`,
        description: 'T8.6.5.4 Integration Test World',
        randomSeed: 54321,
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
        id: `reg-${testSuffix}`,
        name: 'Central Region',
        climate: 'TEMPERATE',
        description: 'Testing Consumption & Demand',
        population: 0,
        coordX: 0,
        coordY: 0,
        worldId
      }
    });
    regionId = region.id;

    // Create Store Workplace
    const storeWp = await prisma.workplace.create({
      data: {
        id: `store-${testSuffix}`,
        locationId: `loc-store-${testSuffix}`,
        type: 'STORE',
        regionId,
        capacity: 5,
        occupiedPositions: 0,
        vacancies: 5
      }
    });

    const storeWallet = await prisma.wallet.create({
      data: {
        id: `w-store-${testSuffix}`,
        ownerId: storeWp.id,
        balance: 10000,
        currency: 'CREDIT'
      }
    });

    const storeInv = await prisma.inventory.create({
      data: {
        id: `inv-store-${testSuffix}`,
        ownerId: storeWp.id,
        storageCapacity: 5000
      }
    });
    storeInvId = storeInv.id;

    // Create Household
    const hh = await prisma.household.create({
      data: {
        id: `hh-${testSuffix}`,
        locationId: `loc-hh-${testSuffix}`,
        inventoryId: `inv-hh-${testSuffix}`,
        walletId: `w-hh-${testSuffix}`
      }
    });
    householdId = hh.id;

    const hhWallet = await prisma.wallet.create({
      data: {
        id: `w-hh-${testSuffix}`,
        ownerId: householdId,
        balance: 2000,
        currency: 'CREDIT'
      }
    });

    const hhInv = await prisma.inventory.create({
      data: {
        id: `inv-hh-${testSuffix}`,
        ownerId: householdId,
        storageCapacity: 2000
      }
    });
    householdInvId = hhInv.id;

    // 1. Living Adult Citizen (Status: ACTIVE, Age: 30)
    activeAdultId = `cit-adult-${testSuffix}`;
    await prisma.citizen.create({
      data: {
        id: activeAdultId,
        name: 'Jane Adult',
        gender: 'FEMALE',
        status: CitizenStatus.ACTIVE,
        birthDateJson: JSON.stringify({ year: -29, month: 1, day: 1, hour: 0, minute: 0, second: 0 }),
        createdAtSimJson: JSON.stringify({ year: 1, month: 1, day: 1, hour: 0, minute: 0, second: 0 }),
        vitalStateJson: JSON.stringify({ hunger: 80, thirst: 70, energy: 90, health: 100 }),
        personalityJson: JSON.stringify({}),
        skillsJson: JSON.stringify([]),
        employmentStatus: EmploymentStatus.UNEMPLOYED,
        movementState: 'IDLE',
        householdId
      }
    });

    // 2. Living Child Dependent Citizen (Status: ACTIVE, Age: 8)
    activeChildId = `cit-child-${testSuffix}`;
    await prisma.citizen.create({
      data: {
        id: activeChildId,
        name: 'Tommy Child',
        gender: 'MALE',
        status: CitizenStatus.ACTIVE,
        birthDateJson: JSON.stringify({ year: -7, month: 1, day: 1, hour: 0, minute: 0, second: 0 }),
        createdAtSimJson: JSON.stringify({ year: 1, month: 1, day: 1, hour: 0, minute: 0, second: 0 }),
        vitalStateJson: JSON.stringify({ hunger: 60, thirst: 70, energy: 100, health: 100 }),
        personalityJson: JSON.stringify({}),
        skillsJson: JSON.stringify([]),
        employmentStatus: EmploymentStatus.STUDENT,
        movementState: 'IDLE',
        householdId
      }
    });

    // 3. Deceased Citizen (Status: DECEASED, with residual high hunger & thirst)
    deceasedCitizenId = `cit-deceased-${testSuffix}`;
    await prisma.citizen.create({
      data: {
        id: deceasedCitizenId,
        name: 'Old Ghost',
        gender: 'MALE',
        status: CitizenStatus.DECEASED,
        birthDateJson: JSON.stringify({ year: -80, month: 1, day: 1, hour: 0, minute: 0, second: 0 }),
        createdAtSimJson: JSON.stringify({ year: 1, month: 1, day: 1, hour: 0, minute: 0, second: 0 }),
        vitalStateJson: JSON.stringify({ hunger: 100, thirst: 100, energy: 0, health: 0 }),
        personalityJson: JSON.stringify({}),
        skillsJson: JSON.stringify([]),
        employmentStatus: EmploymentStatus.RETIRED,
        movementState: 'IDLE',
        householdId
      }
    });
  });

  afterAll(async () => {
    await prisma.consumptionRecord.deleteMany();
    await prisma.transactionRecord.deleteMany();
    await prisma.jobPosition.deleteMany();
    await prisma.citizen.deleteMany();
    await prisma.household.deleteMany();
    await prisma.inventoryItem.deleteMany();
    await prisma.inventory.deleteMany();
    await prisma.workplace.deleteMany();
    await prisma.wallet.deleteMany();
    await prisma.region.deleteMany();
    await prisma.world.deleteMany();
    await prisma.$disconnect();
  });

  test('1. Consumption writes are tracked in pendingWrites and can be flushed', async () => {
    consumptionService.reset();
    expect(consumptionService.getPendingCount()).toBe(0);

    const eventId = `cons-track-${Date.now()}`;
    const record = {
      eventId,
      timestamp: 86400,
      simulationDay: 1,
      simulationHour: 12,
      consumerId: activeAdultId,
      householdId,
      sourceInventoryId: householdInvId,
      commodityId: 'wheat',
      quantity: 5,
      unit: 'kg',
      context: 'CITIZEN_NEED',
      regionId,
      worldId
    };

    // Synchronous ledger recording enqueues tracked persistence
    const accepted = consumptionService.consumptionLedger.record(record);
    expect(accepted).toBe(true);

    // Flush drains pending write to DB
    await consumptionService.flush();
    expect(consumptionService.getPendingCount()).toBe(0);
    expect(consumptionService.isDurable(eventId)).toBe(true);

    // Confirm DB has record
    const dbRecord = await prisma.consumptionRecord.findUnique({ where: { eventId } });
    expect(dbRecord).not.toBeNull();
    expect(dbRecord?.quantity).toBe(5);
    expect(dbRecord?.commodityId).toBe('wheat');
  });

  test('2. A flush propagates persistence failure and evicts from in-memory ledger', async () => {
    const brokenEventId = `cons-fail-${Date.now()}`;
    const brokenRecord = {
      eventId: brokenEventId,
      timestamp: 86400,
      consumerId: activeAdultId,
      commodityId: 'wheat',
      quantity: 4,
      unit: 'kg',
      context: 'CITIZEN_NEED',
      regionId
    };

    // Spy on consumptionRepository to simulate unexpected DB failure
    const spy = jest.spyOn(consumptionRepository, 'recordConsumption')
      .mockRejectedValueOnce(new Error('Simulated SQLite disk/connection failure'));

    consumptionService.consumptionLedger.record(brokenRecord);

    // Flush must reject and report the failure
    await expect(consumptionService.flush()).rejects.toThrow('Simulated SQLite disk/connection failure');

    // Failed record must NOT be considered durable
    expect(consumptionService.isDurable(brokenEventId)).toBe(false);

    // Record must be evicted from in-memory ledger so the system does NOT believe it was durably saved
    expect(consumptionService.consumptionLedger.hasEvent(brokenEventId)).toBe(false);
    expect(consumptionService.consumptionLedger.getRecords().some(r => r.eventId === brokenEventId)).toBe(false);

    spy.mockRestore();
  });

  test('3. Cold restart sees every successfully persisted consumption record exactly once', async () => {
    // Write 3 records to DB
    const ev1 = `cold-ev-1-${Date.now()}`;
    const ev2 = `cold-ev-2-${Date.now()}`;
    const ev3 = `cold-ev-3-${Date.now()}`;

    await consumptionService.recordConsumption({
      eventId: ev1, timestamp: 86400, commodityId: 'wheat', quantity: 2, unit: 'kg', context: 'CITIZEN_NEED', regionId
    });
    await consumptionService.recordConsumption({
      eventId: ev2, timestamp: 86400, commodityId: 'wheat', quantity: 3, unit: 'kg', context: 'CITIZEN_NEED', regionId
    });
    await consumptionService.recordConsumption({
      eventId: ev3, timestamp: 86400, commodityId: 'water', quantity: 5, unit: 'L', context: 'CITIZEN_NEED', regionId
    });

    // Simulate cold restart: clear in-memory state
    consumptionService.reset();
    expect(consumptionService.consumptionLedger.count()).toBe(0);
    expect(consumptionService.isDurable(ev1)).toBe(false);

    // Hydrate from DB (simulating bootstrap sequence)
    const hydratedCount = await consumptionService.hydrateFromDatabase(regionId);
    expect(hydratedCount).toBeGreaterThanOrEqual(3);

    expect(consumptionService.consumptionLedger.hasEvent(ev1)).toBe(true);
    expect(consumptionService.consumptionLedger.hasEvent(ev2)).toBe(true);
    expect(consumptionService.consumptionLedger.hasEvent(ev3)).toBe(true);
    expect(consumptionService.isDurable(ev1)).toBe(true);
    expect(consumptionService.isDurable(ev2)).toBe(true);
    expect(consumptionService.isDurable(ev3)).toBe(true);

    // Verify deduplication on rehydration: calling hydrate again does not duplicate
    const initialCount = consumptionService.consumptionLedger.count();
    await consumptionService.hydrateFromDatabase(regionId);
    expect(consumptionService.consumptionLedger.count()).toBe(initialCount);
  });

  test('4. Replaying an event does not create duplicate consumption history', async () => {
    const replayEventId = `replay-test-${Date.now()}`;
    const record = {
      eventId: replayEventId,
      timestamp: 90000,
      commodityId: 'wheat',
      quantity: 3,
      unit: 'kg',
      context: 'CITIZEN_NEED',
      regionId
    };

    const firstResult = await consumptionService.recordConsumption(record);
    expect(firstResult).toBe(true);

    const initialLedgerCount = consumptionService.consumptionLedger.count();
    const initialDbCount = await prisma.consumptionRecord.count({ where: { eventId: replayEventId } });
    expect(initialDbCount).toBe(1);

    // Replay attempt on same eventId
    const replayResult = await consumptionService.recordConsumption(record);
    expect(replayResult).toBe(false); // Ledger rejects duplicate eventId

    // Assert counts unchanged
    expect(consumptionService.consumptionLedger.count()).toBe(initialLedgerCount);
    const afterDbCount = await prisma.consumptionRecord.count({ where: { eventId: replayEventId } });
    expect(afterDbCount).toBe(1);
  });

  test('5. Deceased citizens do not inflate active food & water demand', async () => {
    // Baseline demand calculation
    const demand = await civilizationDemandService.getDemandIntelligence();

    // Verify deceased citizen (hunger: 100, thirst: 100) is excluded:
    // Adult: hunger 80 - 20 = 60 unmet. Child: hunger 60 - 20 = 40 unmet.
    // Total living unmet hunger = 60 + 40 = 100. At 20 restoration/kg = 5 kg.
    // If deceased (100 - 20 = 80 unmet) were counted, total unmet would be 180 / 20 = 9 kg!
    expect(demand.food.unmet).toBe(5);

    // Adult thirst: 70 - 20 = 50. Child thirst: 70 - 20 = 50.
    // Total living unmet thirst = 100. At 25 restoration/L = 4 L.
    // If deceased (100 - 20 = 80 unmet) were counted, total unmet would be 180 / 25 = 8 L!
    expect(demand.water.unmet).toBe(4);
  });

  test('6. Living children and dependents remain legitimately represented in demand', async () => {
    // If we update child's hunger from 60 to 100 (unmet increases from 40 to 80):
    await prisma.citizen.update({
      where: { id: activeChildId },
      data: {
        vitalStateJson: JSON.stringify({ hunger: 100, thirst: 70, energy: 100, health: 100 })
      }
    });

    const demandAfterChildNeed = await civilizationDemandService.getDemandIntelligence();
    // Living hunger: Adult (60) + Child (80) = 140 unmet. At 20 restoration/kg = 7 kg.
    expect(demandAfterChildNeed.food.unmet).toBe(7);

    // Revert child's hunger back to 60
    await prisma.citizen.update({
      where: { id: activeChildId },
      data: {
        vitalStateJson: JSON.stringify({ hunger: 60, thirst: 70, energy: 100, health: 100 })
      }
    });
  });

  test('7. Newly hired workers start with daysWorked: 0 and receive 0 unearned wages upon immediate payroll cycle', async () => {
    // Setup workplace and citizen in memory
    const wp: any = {
      id: `factory-payroll-${Date.now()}`,
      name: 'Payroll Test Factory',
      type: WorkplaceType.FACTORY,
      regionId,
      capacity: 2,
      occupiedPositions: 0,
      vacancies: 2,
      positions: [{
        id: `pos-craft-${Date.now()}`,
        workplaceId: `factory-payroll-${Date.now()}`,
        type: JobType.CRAFTSMAN,
        occupantId: null
      }],
      wallet: {
        id: `w-factory-${Date.now()}`,
        ownerId: `factory-payroll-${Date.now()}`,
        balance: 50000,
        currency: 'CREDIT',
        totalIncome: 0,
        totalExpenses: 0
      }
    };
    worldService.engine.workplaceRepository.create(wp);

    const currentTime = timeService.engine.getCurrentTime();
    const newWorker = citizenService.engine.createCitizen(
      CitizenGender.MALE,
      null,
      { ...currentTime, year: currentTime.year - 25 }
    );
    newWorker.wallet = {
      id: `w-worker-${Date.now()}`,
      ownerId: newWorker.id,
      balance: 100,
      currency: 'CREDIT',
      totalIncome: 0,
      totalExpenses: 0
    };

    // Assign job via OccupationService
    citizenService.occupationService.assignJob(newWorker, wp, wp.positions[0]);

    // Verify initial employment record has exactly 0 days worked
    expect(newWorker.employmentRecord).toBeDefined();
    expect(newWorker.employmentRecord?.daysWorked).toBe(0);
    expect(newWorker.employmentStatus).toBe(EmploymentStatus.EMPLOYED);

    // Verify expected monthly salary for 0 days worked is exactly 0
    const expectedSalary = SalaryService.calculateExpectedMonthlySalary(newWorker, wp as any);
    expect(expectedSalary).toBe(0);

    // If salaryService exists, run payroll cycle and verify 0 wages disbursed
    if (citizenService.engine.salaryService) {
      const initialBalance = newWorker.wallet.balance;
      await citizenService.engine.salaryService.runPayrollCycle();
      expect(newWorker.wallet.balance).toBe(initialBalance); // No unearned money disbursed!
    }
    expect(newWorker.employmentRecord?.daysWorked).toBe(0);
  });

  test('8. persistTickBoundary flushes consumption persistence and ensures durable state', async () => {
    const tickEventId = `tick-flush-${Date.now()}`;
    consumptionService.consumptionLedger.record({
      eventId: tickEventId,
      timestamp: 95000,
      commodityId: 'wheat',
      quantity: 1.5,
      unit: 'kg',
      context: 'CITIZEN_NEED',
      regionId
    });

    // Calling persistTickBoundary must invoke consumptionService.flush()
    await persistenceService.persistTickBoundary();

    expect(consumptionService.getPendingCount()).toBe(0);
    expect(consumptionService.isDurable(tickEventId)).toBe(true);

    const dbRecord = await prisma.consumptionRecord.findUnique({ where: { eventId: tickEventId } });
    expect(dbRecord).not.toBeNull();
    expect(dbRecord?.quantity).toBe(1.5);
  });
});
