import { Citizen, CitizenGender, CitizenStatus, MovementState, EmploymentStatus, ActionInstance, ActionState, ActionType, SimulationTime } from '@genesis/shared';
import { ConsumptionEngine } from '../ConsumptionEngine';
import { ResourceInteractionExecutor } from '../../execution/ResourceInteractionExecutor';
import { InventoryManager } from '../../inventory/InventoryManager';
import { NeedsService } from '../../citizen/services/NeedsService';
import { ActionLifecycleManager } from '../../execution/ActionLifecycleManager';
import { CitizenRepository } from '../../citizen/repositories/CitizenRepository';
import { EventScheduler } from '../../events/EventScheduler';
import { TimeEngine } from '../../time/TimeEngine';

class MockCitizenRepository implements CitizenRepository {
  public citizens: Map<string, Citizen> = new Map();
  public dirtySet: Set<string> = new Set();
  create(citizen: Citizen): void { this.citizens.set(citizen.id, citizen); }
  findById(id: string): Citizen | undefined { return this.citizens.get(id); }
  findAll(): Citizen[] { return Array.from(this.citizens.values()); }
  update(citizen: Citizen): void { this.citizens.set(citizen.id, citizen); this.dirtySet.add(citizen.id); }
  delete(id: string): boolean { return this.citizens.delete(id); }
  clear(): void { this.citizens.clear(); this.dirtySet.clear(); }
}

describe('T5.2 ResourceInteractionExecutor and ConsumptionEngine', () => {
  let inventoryManager: InventoryManager;
  let citizenRepository: MockCitizenRepository;
  let needsService: NeedsService;
  let timeEngine: TimeEngine;
  let eventScheduler: EventScheduler;
  let lifecycleManager: ActionLifecycleManager;
  let consumptionEngine: ConsumptionEngine;
  let executor: ResourceInteractionExecutor;
  let citizen: Citizen;

  beforeEach(() => {
    inventoryManager = new InventoryManager();
    citizenRepository = new MockCitizenRepository();
    needsService = new NeedsService(citizenRepository);
    timeEngine = new TimeEngine();
    eventScheduler = new EventScheduler(timeEngine);
    lifecycleManager = new ActionLifecycleManager(eventScheduler, timeEngine);

    const getCommodity = (productId: string) => {
      if (productId === 'bread') return { id: 'bread', consumable: { restorationNeed: 'HUNGER', restorationValue: 10 } } as any;
      if (productId === 'water') return { id: 'water', consumable: { restorationNeed: 'THIRST', restorationValue: 20 } } as any;
      if (productId === 'medkit') return { id: 'medkit', consumable: { restorationNeed: 'HEALTH', restorationValue: 50 } } as any;
      return undefined;
    };

    consumptionEngine = new ConsumptionEngine(inventoryManager, needsService, getCommodity);
    executor = new ResourceInteractionExecutor(lifecycleManager, consumptionEngine);

    const startTime: SimulationTime = { year: 1, month: 1, day: 1, hour: 10, minute: 0, second: 0 };
    citizen = {
      id: 'C001',
      name: 'Test',
      birthDate: startTime,
      gender: CitizenGender.MALE,
      status: CitizenStatus.ACTIVE,
      createdAt: startTime,
      locationId: null,
      vitalState: { hunger: 50, thirst: 50, energy: 50, health: 50, lastUpdatedSimulationTime: startTime },
      movementState: MovementState.IDLE,
      activeRoute: null,
      skills: [],
      employmentStatus: EmploymentStatus.UNEMPLOYED,
      workplaceId: null,
      jobType: null,
      jobSchedule: null,
      householdId: 'H001',
      personality: {} as any,
      wallet: { id: 'W', ownerId: 'C001', balance: 0, totalIncome: 0, totalExpenses: 0, currency: 'GEN' }
    };

    citizenRepository.create(citizen);
    inventoryManager.createInventory('INV1', 'C001', 100);
  });

  function createAction(type: ActionType): ActionInstance {
    return {
      actionId: 'A1',
      citizenId: 'C001',
      actionType: type,
      state: ActionState.STARTED,
      startedAt: { year: 1, month: 1, day: 1, hour: 8, minute: 0, second: 0 },
      source: 'test-inv',
      reason: 'test'
    };
  }

  function simulateTick(action: ActionInstance) {
    const startContext = { citizen, action, currentTime: { year: 1, month: 1, day: 1, hour: 8, minute: 0, second: 0 } };
    executor.start(startContext);
    // Force complete the action by ticking at future time (1 hour later)
    const tickContext = { citizen, action, currentTime: { year: 1, month: 1, day: 1, hour: 9, minute: 0, second: 0 } };
    executor.tick(tickContext);
  }

  test('Exact consumption perfectly matches need', () => {
    // Hunger is 50. Target is 20. Needs 30 restoration.
    // Bread gives 10 per unit. So 3 bread required.
    inventoryManager.addItemQuantity('INV1', 'bread', 3, 'kg');
    const action = createAction(ActionType.CONSUME_FOOD);
    
    simulateTick(action);

    expect(action.state).toBe(ActionState.COMPLETED);
    expect(citizen.vitalState.hunger).toBe(20);
    
    const inv = inventoryManager.getInventory('INV1')!;
    expect(inv.items['bread']).toBeUndefined(); // 3 consumed, 0 left -> deleted
    expect(citizenRepository.dirtySet.has('C001')).toBe(true);
  });

  test('Insufficient inventory consumes what is available', () => {
    // Hunger 50 -> Needs 30 restoration -> 3 bread required.
    // Only 2 bread available.
    inventoryManager.addItemQuantity('INV1', 'bread', 2, 'kg');
    const action = createAction(ActionType.CONSUME_FOOD);
    
    simulateTick(action);

    expect(action.state).toBe(ActionState.COMPLETED);
    expect(citizen.vitalState.hunger).toBe(30); // 50 - (2 * 10) = 30
    
    const inv = inventoryManager.getInventory('INV1')!;
    expect(inv.items['bread']).toBeUndefined();
  });

  test('Zero inventory fails immediately', () => {
    const action = createAction(ActionType.CONSUME_FOOD);
    
    simulateTick(action);

    expect(action.state).toBe(ActionState.FAILED);
    expect(citizen.vitalState.hunger).toBe(50); // Unchanged
  });

  test('Medicine consumption reduces medicine and increases health', () => {
    // Health 50 -> Needs 50 restoration to reach 100.
    // Medkit gives 50 per unit. So 1 medkit required.
    inventoryManager.addItemQuantity('INV1', 'medkit', 2, 'unit');
    const action = createAction(ActionType.SEEK_MEDICAL_HELP);
    
    simulateTick(action);

    expect(action.state).toBe(ActionState.COMPLETED);
    expect(citizen.vitalState.health).toBe(100);
    
    const inv = inventoryManager.getInventory('INV1')!;
    expect(inv.items['medkit'].totalQuantity).toBe(1);
    expect(citizenRepository.dirtySet.has('C001')).toBe(true);
  });

  test('No magical resource creation occurs', () => {
    // Ensure that if we have 1 bread, we don't end up satisfying more than 10 hunger
    // and no negative inventory.
    inventoryManager.addItemQuantity('INV1', 'bread', 1, 'kg');
    const action = createAction(ActionType.CONSUME_FOOD);
    
    simulateTick(action);

    expect(citizen.vitalState.hunger).toBe(40);
    const inv = inventoryManager.getInventory('INV1')!;
    expect(inv.items['bread']).toBeUndefined(); // Cannot be negative
  });
});
