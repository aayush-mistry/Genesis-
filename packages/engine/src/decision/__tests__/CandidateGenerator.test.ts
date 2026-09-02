import { ActionType, CandidateAction, DecisionContext, EmploymentStatus, NeedState, NeedUrgencyLevel, PerceptionSnapshot, RoutineActivityType } from '@genesis/shared';
import { CandidateGenerator } from '../CandidateGenerator';

describe('CandidateGenerator (T5.4)', () => {
  let generator: CandidateGenerator;

  beforeEach(() => {
    generator = new CandidateGenerator();
  });

  const createMockPerception = (): PerceptionSnapshot => ({
    timestamp: new Date(),
    nearbyBuildings: [],
    nearbyResources: []
  } as any); // Added 'as any' just in case other things are missing, but removing nearbyCitizens

  const createMockContext = (overrides: Partial<DecisionContext> = {}): DecisionContext => ({
    citizenId: 'citizen-1',
    age: 30,
    vitalState: { hunger: 100, thirst: 100, energy: 100, health: 100, lastUpdatedSimulationTime: { year: 1, month: 1, day: 1, hour: 0, minute: 0, second: 0 } },
    skills: [],
    employmentStatus: EmploymentStatus.EMPLOYED,
    workplaceId: 'wp-1',
    workplaceLocationId: 'building-wp-1',
    currentLocationId: 'loc-1',
    currentDestinationId: null,
    simulationTime: new Date(),
    perception: createMockPerception(),
    householdId: 'hh-1',
    homeId: 'building-home-1',
    ...overrides
  });

  it('TEST 1: Employed citizen with valid workplace -> GO_TO_WORK candidate targets actual workplace.', () => {
    const context = createMockContext({
      currentRoutineActivity: { id: 'act1', interruptible: true, type: RoutineActivityType.WORK, destinationType: 'WORKPLACE', startTime: 9, endTime: 17 }
    });
    const candidates = generator.generateCandidates(context, []);
    
    const workCandidate = candidates.find(c => c.type === ActionType.GO_TO_WORK);
    expect(workCandidate).toBeDefined();
    expect(workCandidate?.target?.id).toBe('building-wp-1');
  });

  it('TEST 2: Citizen without job -> no GO_TO_WORK candidate.', () => {
    const context = createMockContext({
      employmentStatus: EmploymentStatus.UNEMPLOYED,
      workplaceId: null,
      workplaceLocationId: undefined,
      currentRoutineActivity: { id: 'act1', interruptible: true, type: RoutineActivityType.WORK, destinationType: 'WORKPLACE', startTime: 9, endTime: 17 }
    });
    const candidates = generator.generateCandidates(context, []);
    
    const workCandidate = candidates.find(c => c.type === ActionType.GO_TO_WORK || c.type === ActionType.WORK);
    expect(workCandidate).toBeUndefined();
  });

  it('TEST 3: Citizen already at workplace -> no unnecessary GO_TO_WORK candidate.', () => {
    const context = createMockContext({
      currentLocationId: 'building-wp-1',
      currentRoutineActivity: { id: 'act1', interruptible: true, type: RoutineActivityType.WORK, destinationType: 'WORKPLACE', startTime: 9, endTime: 17 }
    });
    const candidates = generator.generateCandidates(context, []);
    
    const goToWorkCandidate = candidates.find(c => c.type === ActionType.GO_TO_WORK);
    expect(goToWorkCandidate).toBeUndefined();
    
    const workCandidate = candidates.find(c => c.type === ActionType.WORK);
    expect(workCandidate).toBeDefined();
    expect(workCandidate?.target?.id).toBe('building-wp-1');
  });

  it('TEST 4: Valid home relationship -> home candidate targets actual home.', () => {
    const context = createMockContext({
      currentLocationId: 'building-wp-1',
      currentRoutineActivity: { id: 'act1', interruptible: true, type: RoutineActivityType.REST, destinationType: 'HOME', startTime: 22, endTime: 6 }
    });
    const candidates = generator.generateCandidates(context, []);
    
    const homeCandidate = candidates.find(c => c.type === ActionType.GO_HOME);
    expect(homeCandidate).toBeDefined();
    expect(homeCandidate?.target?.id).toBe('building-home-1');
  });

  it('TEST 5: Missing home -> no fake home candidate.', () => {
    const context = createMockContext({
      homeId: undefined,
      currentRoutineActivity: { id: 'act1', interruptible: true, type: RoutineActivityType.REST, destinationType: 'HOME', startTime: 22, endTime: 6 }
    });
    const candidates = generator.generateCandidates(context, []);
    
    const homeCandidate = candidates.find(c => c.type === ActionType.GO_HOME);
    expect(homeCandidate).toBeUndefined();
    
    const restCandidate = candidates.find(c => c.type === ActionType.REST);
    expect(restCandidate).toBeDefined();
  });

  it('TEST 6/7: Student / Non-student -> no school candidate.', () => {
    const context = createMockContext({
      employmentStatus: EmploymentStatus.STUDENT,
      currentRoutineActivity: { id: 'act1', interruptible: true, type: RoutineActivityType.STUDY, destinationType: 'SCHOOL', startTime: 8, endTime: 15 }
    });
    const candidates = generator.generateCandidates(context, []);
    
    const schoolCandidate = candidates.find(c => c.type === ActionType.GO_TO_SCHOOL || c.type === ActionType.STUDY);
    expect(schoolCandidate).toBeUndefined();
  });

  it('TEST 10: Work schedule outside working period -> WORK candidate is not generated.', () => {
    const context = createMockContext({
      currentRoutineActivity: { id: 'act1', interruptible: true, type: RoutineActivityType.REST, destinationType: 'HOME', startTime: 22, endTime: 6 }
    });
    const candidates = generator.generateCandidates(context, []);
    
    const workCandidate = candidates.find(c => c.type === ActionType.GO_TO_WORK || c.type === ActionType.WORK);
    expect(workCandidate).toBeUndefined();
  });

  it('TEST 12: No duplicate logical candidates.', () => {
    const context = createMockContext({
      currentRoutineActivity: { id: 'act1', interruptible: true, type: RoutineActivityType.MEAL, destinationType: 'HOME', startTime: 12, endTime: 13 }
    });
    
    const candidates = generator.generateCandidates(context, []);
    
    // MEAL routine should push CONSUME_FOOD and GO_HOME.
    const consumeFoodCandidates = candidates.filter(c => c.type === ActionType.CONSUME_FOOD);
    expect(consumeFoodCandidates.length).toBe(1);
    
    const goHomeCandidates = candidates.filter(c => c.type === ActionType.GO_HOME);
    expect(goHomeCandidates.length).toBe(1);
  });
});
