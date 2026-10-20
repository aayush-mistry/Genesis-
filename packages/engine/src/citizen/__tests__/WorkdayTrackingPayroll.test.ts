import { WorldEngine } from '../../world/WorldEngine';
import { TimeEngine } from '../../time/TimeEngine';
import { EventScheduler } from '../../events/EventScheduler';
import { MarketEngine } from '../../market/MarketEngine';
import { CitizenService } from '../services/CitizenService';
import { SalaryService } from '../services/SalaryService';
import {
  ActionType,
  ActionState,
  EmploymentStatus,
  JobType,
  WorkplaceType,
  CitizenStatus,
  CitizenGender,
  MovementState,
  PersonalityTraits,
  CandidateAction,
  Citizen
} from '@genesis/shared';

import { InMemoryCitizenRepository } from '../repositories/InMemoryCitizenRepository';
import { HouseholdService } from '../services/HouseholdService';
import { InventoryManager } from '../../inventory/InventoryManager';
import { SpatialEngine } from '../../spatial/SpatialEngine';

describe('T8.6.5.1 Task 2 — Work-Day Tracking and Payroll Participation', () => {
  let worldEngine: WorldEngine;
  let timeEngine: TimeEngine;
  let eventScheduler: EventScheduler;
  let marketEngine: MarketEngine;
  let citizenRepository: InMemoryCitizenRepository;
  let citizenService: CitizenService;
  let salaryService: SalaryService;

  const defaultPersonality: PersonalityTraits = {
    priceSensitivity: 50,
    qualityPreference: 50,
    conveniencePreference: 50,
    planningTendency: 50,
    socialEngagement: 50,
    riskTolerance: 50,
    savingTendency: 50
  };

  const createWorkAction = (): CandidateAction => ({
    type: ActionType.WORK,
    source: 'ROUTINE',
    reason: 'Scheduled work shift',
    target: { type: 'WORKPLACE', id: 'factory-1' }
  });

  beforeEach(() => {
    worldEngine = new WorldEngine();
    timeEngine = new TimeEngine(); // Starts at Year 1, Month 1, Day 1, 00:00:00
    eventScheduler = new EventScheduler(timeEngine);
    citizenRepository = new InMemoryCitizenRepository();
    marketEngine = new MarketEngine(
      worldEngine,
      timeEngine,
      eventScheduler,
      (citizenId: string) => citizenRepository.findById(citizenId)?.wallet
    );
    const spatialEngine = new SpatialEngine(worldEngine, eventScheduler);
    const inventoryManager = new InventoryManager();
    const householdService = new HouseholdService(inventoryManager);
    citizenService = new CitizenService(
      citizenRepository,
      worldEngine,
      timeEngine,
      eventScheduler,
      spatialEngine.queryService,
      householdService
    );
    salaryService = new SalaryService(citizenService, worldEngine, marketEngine, eventScheduler, timeEngine);
  });

  const setupEmployedCitizenAndWorkplace = () => {
    const workplace = {
      id: 'factory-1',
      type: WorkplaceType.FACTORY,
      regionId: 'reg-1',
      capacity: 10,
      occupiedPositions: 1,
      vacancies: 9,
      positions: [
        { id: 'pos-1', type: JobType.CRAFTSMAN, workplaceId: 'factory-1', occupantId: 'cit-worker-1' }
      ],
      wallet: { id: 'w-factory', ownerId: 'factory-1', balance: 50000, currency: 'INR', totalIncome: 0, totalExpenses: 0 }
    };
    worldEngine.workplaceRepository.create(workplace as any);

    const citizen: Citizen = {
      id: 'cit-worker-1',
      name: 'John Artisan',
      gender: CitizenGender.MALE,
      birthDate: { year: 1990, month: 1, day: 1, hour: 0, minute: 0, second: 0 },
      createdAt: { year: 1, month: 1, day: 1, hour: 0, minute: 0, second: 0 },
      status: CitizenStatus.ACTIVE,
      vitalState: {
        hunger: 0,
        thirst: 0,
        energy: 100,
        health: 100,
        lastUpdatedSimulationTime: { year: 1, month: 1, day: 1, hour: 0, minute: 0, second: 0 }
      },
      locationId: null,
      movementState: MovementState.IDLE,
      activeRoute: null,
      skills: [{ type: 'CRAFTING' as any, level: 80, experience: 0 }],
      employmentStatus: EmploymentStatus.EMPLOYED,
      workplaceId: 'factory-1',
      jobType: JobType.CRAFTSMAN,
      jobSchedule: null,
      personality: defaultPersonality,
      wallet: { id: 'w-citizen', ownerId: 'cit-worker-1', balance: 500, currency: 'INR', totalIncome: 0, totalExpenses: 0 },
      employmentRecord: {
        daysWorked: 0,
        expectedWorkingDays: 30,
        performanceScore: 1.0,
        startDate: { year: 1, month: 1, day: 1, hour: 0, minute: 0, second: 0 },
        endDate: null,
        lastPaymentDate: null,
        unpaidWages: 0,
        lastWorkDate: null
      }
    };
    citizenRepository.create(citizen);

    return { citizen, workplace };
  };

  it('1. Completes a qualifying work shift and increments daysWorked exactly once', () => {
    const { citizen } = setupEmployedCitizenAndWorkplace();

    // Start a work action on Day 1 at 08:00
    timeEngine.setCurrentTime({ year: 1, month: 1, day: 1, hour: 8, minute: 0, second: 0 });
    citizenService.actionExecutor.executeAction(citizen, createWorkAction());

    expect(citizen.currentAction?.state).toBe(ActionState.IN_PROGRESS);
    expect(citizen.employmentRecord?.daysWorked).toBe(0);

    // Advance 8 hours to shift completion (16:00)
    timeEngine.setCurrentTime({ year: 1, month: 1, day: 1, hour: 16, minute: 0, second: 0 });
    citizenService.actionExecutor.tick(citizen);

    expect(citizen.currentAction?.state).toBe(ActionState.COMPLETED);
    expect(citizen.employmentRecord?.daysWorked).toBe(1);
    expect(citizen.employmentRecord?.lastWorkDate).toEqual({ year: 1, month: 1, day: 1 });
  });

  it('2. Prevents repeated ticks from double-counting the completed shift', () => {
    const { citizen } = setupEmployedCitizenAndWorkplace();

    timeEngine.setCurrentTime({ year: 1, month: 1, day: 1, hour: 8, minute: 0, second: 0 });
    citizenService.actionExecutor.executeAction(citizen, createWorkAction());

    // Advance past completion
    timeEngine.setCurrentTime({ year: 1, month: 1, day: 1, hour: 16, minute: 0, second: 0 });
    citizenService.actionExecutor.tick(citizen);
    expect(citizen.employmentRecord?.daysWorked).toBe(1);

    // Repeated ticks on same completed action
    citizenService.actionExecutor.tick(citizen);
    citizenService.actionExecutor.tick(citizen);
    expect(citizen.employmentRecord?.daysWorked).toBe(1);
  });

  it('3. Prevents multiple work actions completed on the same day from inflating daysWorked', () => {
    const { citizen } = setupEmployedCitizenAndWorkplace();

    // First shift: 00:00 to 08:00 on Day 1
    timeEngine.setCurrentTime({ year: 1, month: 1, day: 1, hour: 0, minute: 0, second: 0 });
    citizenService.actionExecutor.executeAction(citizen, createWorkAction());
    timeEngine.setCurrentTime({ year: 1, month: 1, day: 1, hour: 8, minute: 0, second: 0 });
    citizenService.actionExecutor.tick(citizen);
    expect(citizen.employmentRecord?.daysWorked).toBe(1);

    // Second shift started on the SAME day: 09:00 to 17:00 on Day 1
    timeEngine.setCurrentTime({ year: 1, month: 1, day: 1, hour: 9, minute: 0, second: 0 });
    citizenService.actionExecutor.executeAction(citizen, createWorkAction());
    timeEngine.setCurrentTime({ year: 1, month: 1, day: 1, hour: 17, minute: 0, second: 0 });
    citizenService.actionExecutor.tick(citizen);

    // Must still be 1 because alreadyWorkedToday guard rejects double-counting on the same day
    expect(citizen.employmentRecord?.daysWorked).toBe(1);
    expect(citizen.employmentRecord?.lastWorkDate).toEqual({ year: 1, month: 1, day: 1 });
  });

  it('4. Correctly increments daysWorked across multiple distinct calendar days', () => {
    const { citizen } = setupEmployedCitizenAndWorkplace();

    for (let day = 1; day <= 5; day++) {
      timeEngine.setCurrentTime({ year: 1, month: 1, day, hour: 8, minute: 0, second: 0 });
      citizenService.actionExecutor.executeAction(citizen, createWorkAction());
      timeEngine.setCurrentTime({ year: 1, month: 1, day, hour: 16, minute: 0, second: 0 });
      citizenService.actionExecutor.tick(citizen);
      expect(citizen.employmentRecord?.daysWorked).toBe(day);
    }

    expect(citizen.employmentRecord?.daysWorked).toBe(5);
    expect(citizen.employmentRecord?.lastWorkDate).toEqual({ year: 1, month: 1, day: 5 });
  });

  it('5. Calculates partial-month salary proportional to days worked', () => {
    const { citizen, workplace } = setupEmployedCitizenAndWorkplace();

    // Citizen works 15 days out of 30
    for (let day = 1; day <= 15; day++) {
      timeEngine.setCurrentTime({ year: 1, month: 1, day, hour: 8, minute: 0, second: 0 });
      citizenService.actionExecutor.executeAction(citizen, createWorkAction());
      timeEngine.setCurrentTime({ year: 1, month: 1, day, hour: 16, minute: 0, second: 0 });
      citizenService.actionExecutor.tick(citizen);
    }
    expect(citizen.employmentRecord?.daysWorked).toBe(15);

    // Full month expected salary
    citizen.employmentRecord!.daysWorked = 30;
    const fullSalary = SalaryService.calculateExpectedMonthlySalary(citizen, workplace as any);
    citizen.employmentRecord!.daysWorked = 15;
    const halfSalary = SalaryService.calculateExpectedMonthlySalary(citizen, workplace as any);

    expect(halfSalary).toBe(Math.floor(fullSalary * 0.5));
    expect(halfSalary).toBeGreaterThan(0);
  });

  it('6. Executes three consecutive monthly payroll cycles without manual daysWorked injection', async () => {
    const { citizen, workplace } = setupEmployedCitizenAndWorkplace();
    const initialEmployerBalance = workplace.wallet.balance; // 50000
    const initialEmployeeBalance = citizen.wallet.balance;   // 500

    let totalPaidToCitizen = 0;

    // === MONTH 1 ===
    // Citizen works 20 qualifying shifts across Days 1..20
    for (let day = 1; day <= 20; day++) {
      timeEngine.setCurrentTime({ year: 1, month: 1, day, hour: 8, minute: 0, second: 0 });
      citizenService.actionExecutor.executeAction(citizen, createWorkAction());
      timeEngine.setCurrentTime({ year: 1, month: 1, day, hour: 16, minute: 0, second: 0 });
      citizenService.actionExecutor.tick(citizen);
    }
    expect(citizen.employmentRecord?.daysWorked).toBe(20);

    // Run Month 1 payroll on Day 30
    timeEngine.setCurrentTime({ year: 1, month: 1, day: 30, hour: 23, minute: 59, second: 0 });
    await salaryService.runPayrollCycle();

    const m1Paid = citizen.wallet.balance - initialEmployeeBalance;
    expect(m1Paid).toBeGreaterThan(0);
    expect(workplace.wallet.balance).toBe(initialEmployerBalance - m1Paid);
    expect(citizen.employmentRecord?.daysWorked).toBe(0); // Reset for next month!
    expect(citizen.employmentRecord?.lastPaymentDate?.month).toBe(1);
    totalPaidToCitizen += m1Paid;

    // === MONTH 2 ===
    // Citizen works 25 qualifying shifts across Month 2
    for (let day = 1; day <= 25; day++) {
      timeEngine.setCurrentTime({ year: 1, month: 2, day, hour: 8, minute: 0, second: 0 });
      citizenService.actionExecutor.executeAction(citizen, createWorkAction());
      timeEngine.setCurrentTime({ year: 1, month: 2, day, hour: 16, minute: 0, second: 0 });
      citizenService.actionExecutor.tick(citizen);
    }
    expect(citizen.employmentRecord?.daysWorked).toBe(25);

    // Run Month 2 payroll on Day 30
    timeEngine.setCurrentTime({ year: 1, month: 2, day: 30, hour: 23, minute: 59, second: 0 });
    await salaryService.runPayrollCycle();

    const m2Paid = citizen.wallet.balance - (initialEmployeeBalance + totalPaidToCitizen);
    expect(m2Paid).toBeGreaterThan(0);
    // Since 25 days > 20 days, Month 2 salary must be greater than Month 1 salary
    expect(m2Paid).toBeGreaterThan(m1Paid);
    expect(citizen.employmentRecord?.daysWorked).toBe(0);
    expect(citizen.employmentRecord?.lastPaymentDate?.month).toBe(2);
    totalPaidToCitizen += m2Paid;

    // === MONTH 3 ===
    // Citizen works full 30 days across Month 3
    for (let day = 1; day <= 30; day++) {
      timeEngine.setCurrentTime({ year: 1, month: 3, day, hour: 8, minute: 0, second: 0 });
      citizenService.actionExecutor.executeAction(citizen, createWorkAction());
      timeEngine.setCurrentTime({ year: 1, month: 3, day, hour: 16, minute: 0, second: 0 });
      citizenService.actionExecutor.tick(citizen);
    }
    expect(citizen.employmentRecord?.daysWorked).toBe(30);

    // Run Month 3 payroll on Day 30
    timeEngine.setCurrentTime({ year: 1, month: 3, day: 30, hour: 23, minute: 59, second: 0 });
    await salaryService.runPayrollCycle();

    const m3Paid = citizen.wallet.balance - (initialEmployeeBalance + totalPaidToCitizen);
    expect(m3Paid).toBeGreaterThan(0);
    expect(m3Paid).toBeGreaterThan(m2Paid); // Full 30 days > 25 days
    expect(citizen.employmentRecord?.daysWorked).toBe(0);
    expect(citizen.employmentRecord?.lastPaymentDate?.month).toBe(3);
    totalPaidToCitizen += m3Paid;

    // Strict wallet conservation across employer and employee
    expect(citizen.wallet.balance).toBe(initialEmployeeBalance + totalPaidToCitizen);
    expect(workplace.wallet.balance).toBe(initialEmployerBalance - totalPaidToCitizen);
  });

  it('7. Enforces payroll idempotency within the same billing month', async () => {
    const { citizen, workplace } = setupEmployedCitizenAndWorkplace();

    // Work 10 days in Month 1
    for (let day = 1; day <= 10; day++) {
      timeEngine.setCurrentTime({ year: 1, month: 1, day, hour: 8, minute: 0, second: 0 });
      citizenService.actionExecutor.executeAction(citizen, createWorkAction());
      timeEngine.setCurrentTime({ year: 1, month: 1, day, hour: 16, minute: 0, second: 0 });
      citizenService.actionExecutor.tick(citizen);
    }

    timeEngine.setCurrentTime({ year: 1, month: 1, day: 30, hour: 23, minute: 0, second: 0 });
    await salaryService.runPayrollCycle();

    const balanceAfterFirstCycle = citizen.wallet.balance;
    const workplaceAfterFirstCycle = workplace.wallet.balance;

    // Replay payroll cycle immediately in the same month
    await salaryService.runPayrollCycle();

    // Balances must remain identical (no duplicate disbursement)
    expect(citizen.wallet.balance).toBe(balanceAfterFirstCycle);
    expect(workplace.wallet.balance).toBe(workplaceAfterFirstCycle);
  });

  it('8. Does not increment daysWorked for non-qualifying work by unemployed citizens', () => {
    const unemployedCitizen: Citizen = {
      id: 'cit-unemployed',
      name: 'Bob Unemployed',
      gender: CitizenGender.MALE,
      birthDate: { year: 1990, month: 1, day: 1, hour: 0, minute: 0, second: 0 },
      createdAt: { year: 1, month: 1, day: 1, hour: 0, minute: 0, second: 0 },
      status: CitizenStatus.ACTIVE,
      vitalState: {
        hunger: 0,
        thirst: 0,
        energy: 100,
        health: 100,
        lastUpdatedSimulationTime: { year: 1, month: 1, day: 1, hour: 0, minute: 0, second: 0 }
      },
      locationId: null,
      movementState: MovementState.IDLE,
      activeRoute: null,
      skills: [],
      employmentStatus: EmploymentStatus.UNEMPLOYED,
      workplaceId: null,
      jobType: null,
      jobSchedule: null,
      personality: defaultPersonality,
      wallet: { id: 'w-unemployed', ownerId: 'cit-unemployed', balance: 100, currency: 'INR', totalIncome: 0, totalExpenses: 0 }
    };
    citizenRepository.create(unemployedCitizen);

    timeEngine.setCurrentTime({ year: 1, month: 1, day: 1, hour: 8, minute: 0, second: 0 });
    citizenService.actionExecutor.executeAction(unemployedCitizen, createWorkAction());

    timeEngine.setCurrentTime({ year: 1, month: 1, day: 1, hour: 16, minute: 0, second: 0 });
    citizenService.actionExecutor.tick(unemployedCitizen);

    expect(unemployedCitizen.currentAction?.state).toBe(ActionState.COMPLETED);
    // Unemployed citizen should not have daysWorked incremented
    expect(unemployedCitizen.employmentRecord).toBeUndefined();
  });

  it('9. Persists and hydrates employment record correctly across serialization round-trip', () => {
    const { citizen } = setupEmployedCitizenAndWorkplace();

    // Complete 3 work days
    for (let day = 1; day <= 3; day++) {
      timeEngine.setCurrentTime({ year: 1, month: 1, day, hour: 8, minute: 0, second: 0 });
      citizenService.actionExecutor.executeAction(citizen, createWorkAction());
      timeEngine.setCurrentTime({ year: 1, month: 1, day, hour: 16, minute: 0, second: 0 });
      citizenService.actionExecutor.tick(citizen);
    }

    expect(citizen.employmentRecord?.daysWorked).toBe(3);
    expect(citizen.employmentRecord?.lastWorkDate).toEqual({ year: 1, month: 1, day: 3 });

    // Simulate SQLite JSON persistence round-trip as performed by PersistenceService
    const serialized = JSON.stringify(citizen.employmentRecord);
    const hydrated = JSON.parse(serialized);

    expect(hydrated.daysWorked).toBe(3);
    expect(hydrated.expectedWorkingDays).toBe(30);
    expect(hydrated.lastWorkDate).toEqual({ year: 1, month: 1, day: 3 });
  });

  it('10. Newly hired worker initialized via OccupationService starts with daysWorked: 0 and receives 0 unearned wages upon immediate payroll cycle', async () => {
    const { workplace } = setupEmployedCitizenAndWorkplace();
    const { OccupationService } = await import('../services/OccupationService');
    const occupationService = new OccupationService(citizenService, worldEngine.workplaceRepository);
    const time = timeEngine.getCurrentTime();
    
    const newCitizen: Citizen = {
      id: 'cit-new-hire',
      name: 'Alice Newhire',
      gender: CitizenGender.FEMALE,
      birthDate: { ...time, year: time.year - 25 },
      createdAt: { ...time },
      status: CitizenStatus.ACTIVE,
      locationId: null,
      vitalState: { hunger: 0, thirst: 0, energy: 100, health: 100, lastUpdatedSimulationTime: { year: 1, month: 1, day: 1, hour: 0, minute: 0, second: 0 } },
      wallet: { id: 'w-newhire', ownerId: 'cit-new-hire', balance: 100, currency: 'INR', totalIncome: 0, totalExpenses: 0 },
      movementState: MovementState.IDLE,
      activeRoute: null,
      skills: [],
      employmentStatus: EmploymentStatus.UNEMPLOYED,
      workplaceId: null,
      jobType: null,
      jobSchedule: null,
      personality: defaultPersonality
    };
    citizenRepository.create(newCitizen);

    const pos = {
      id: 'pos-open-1',
      type: JobType.CRAFTSMAN,
      workplaceId: workplace.id,
      occupantId: null
    };
    workplace.positions.push(pos as any);

    occupationService.assignJob(newCitizen, workplace as any, pos as any);

    // Verify initial employment record has 0 days worked
    expect(newCitizen.employmentRecord).toBeDefined();
    expect(newCitizen.employmentRecord?.daysWorked).toBe(0);
    expect(newCitizen.employmentStatus).toBe(EmploymentStatus.EMPLOYED);

    // If payroll cycle executes immediately, worker should receive 0 unearned wages
    const initialBalance = newCitizen.wallet.balance;
    await salaryService.runPayrollCycle();
    expect(newCitizen.wallet.balance).toBe(initialBalance);
  });
});

