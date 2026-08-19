import { CandidateActionSet, ActionType, DecisionContext, EmploymentStatus } from '@genesis/shared';
import { UtilityEngine } from '../UtilityEngine';
import { UtilityWeights } from '../UtilityWeights';

describe('UtilityEngine (Phase 4.4)', () => {
  let engine: UtilityEngine;

  const createMockContext = (overrides: Partial<DecisionContext> = {}): DecisionContext => ({
    citizenId: 'citizen-1',
    age: 30,
    vitalState: { hunger: 50, thirst: 50, energy: 50, health: 100, lastUpdatedSimulationTime: new Date() as any },
    skills: [],
    employmentStatus: EmploymentStatus.EMPLOYED,
    workplaceId: 'workplace-1',
    currentLocationId: 'loc-1',
    currentDestinationId: null,
    simulationTime: new Date('2025-01-01T12:00:00Z'),
    perception: {
      timestamp: new Date('2025-01-01T12:00:00Z'),
      citizenId: 'citizen-1',
      self: {} as any,
      location: {} as any,
      environment: {} as any,
      nearbyResources: [],
      nearbyBuildings: [],
      nearbyEntities: [],
      schedule: {} as any
    },
    ...overrides
  });

  const createCandidateSet = (candidates: any[]): CandidateActionSet => ({
    citizenId: 'citizen-1',
    timestamp: new Date(),
    triggeredNeeds: [],
    candidates
  });

  beforeEach(() => {
    engine = new UtilityEngine();
  });

  it('TEST 1: Utility scores always remain 0-100', () => {
    // Force a scenario that would theoretically score > 100
    const context = createMockContext({
      vitalState: { ...createMockContext().vitalState, hunger: 100 }, // Base 100 * CRITICAL = 250
    });
    const candidates = createCandidateSet([
      { type: ActionType.EAT, source: 'HUNGER', reason: '' }
    ]);

    const result = engine.evaluate(candidates, context);
    expect(result.rankedActions[0].score).toBe(100); // Clamped
  });

  it('TEST 2 & 6: Higher hunger increases food utility and critical need has stronger influence', () => {
    const contextModerate = createMockContext({ vitalState: { ...createMockContext().vitalState, hunger: 60 } }); // 60 * 1.0 = 60
    const contextCritical = createMockContext({ vitalState: { ...createMockContext().vitalState, hunger: 90 } }); // 90 * 2.5 = 225 -> 100
    
    const candidates = createCandidateSet([{ type: ActionType.EAT, source: 'HUNGER', reason: '' }]);

    const resModerate = engine.evaluate(candidates, contextModerate);
    const resCritical = engine.evaluate(candidates, contextCritical);

    expect(resModerate.rankedActions[0].score).toBe(60);
    expect(resCritical.rankedActions[0].score).toBe(100);
    expect(resCritical.rankedActions[0].score).toBeGreaterThan(resModerate.rankedActions[0].score);
  });

  it('TEST 3: Higher thirst increases water utility', () => {
    const context = createMockContext({ vitalState: { ...createMockContext().vitalState, thirst: 70 } }); // HIGH -> 70 * 1.5 = 105 -> 100
    const candidates = createCandidateSet([{ type: ActionType.DRINK, source: 'THIRST', reason: '' }]);
    const result = engine.evaluate(candidates, context);
    expect(result.rankedActions[0].score).toBe(100);
  });

  it('TEST 4: Lower energy increases REST utility', () => {
    // Energy 10 -> Need is 90 -> CRITICAL -> 90 * 2.5 = 225 -> 100
    const context = createMockContext({ vitalState: { ...createMockContext().vitalState, energy: 10 } }); 
    const candidates = createCandidateSet([{ type: ActionType.REST, source: 'ENERGY', reason: '' }]);
    const result = engine.evaluate(candidates, context);
    expect(result.rankedActions[0].score).toBe(100);
  });

  it('TEST 5: Lower health increases medical utility (and Safety module)', () => {
    // Health 20 -> Need 80 (HIGH = 80*1.5 = 120), plus Safety Bonus (80)
    const context = createMockContext({ vitalState: { ...createMockContext().vitalState, health: 20 } }); 
    const candidates = createCandidateSet([{ type: ActionType.SEEK_MEDICAL_HELP, source: 'HEALTH', reason: '' }]);
    const result = engine.evaluate(candidates, context);
    expect(result.rankedActions[0].score).toBe(100); // Clamped
  });

  it('TEST 8 & 9: Schedule proximity increases schedule utility', () => {
    const context = createMockContext({
      perception: {
        ...createMockContext().perception,
        schedule: { currentActivity: 'WORK', nextActivity: 'REST' } as any
      }
    });
    
    const candidates = createCandidateSet([{ type: ActionType.GO_TO_WORK, source: 'WORK_SCHEDULE', reason: '' }]);
    const result = engine.evaluate(candidates, context);
    
    expect(result.rankedActions[0].breakdown.schedule).toBe(UtilityWeights.SCHEDULE_ACTIVE_BONUS);
  });

  it('TEST 10: Distance affects travel utility negatively', () => {
    const context = createMockContext({
      perception: {
        ...createMockContext().perception,
        nearbyResources: [{ id: 'res-1', type: 'WATER', distance: 10 }] as any
      }
    });
    
    const candidates = createCandidateSet([{ type: ActionType.GO_TO_WATER_SOURCE, source: 'THIRST', target: { type: 'RESOURCE', id: 'res-1' }, reason: '' }]);
    const result = engine.evaluate(candidates, context);
    
    // Penalty = 10 * -0.5 = -5
    expect(result.rankedActions[0].breakdown.travel).toBe(-5);
  });

  it('TEST 15: Resource availability affects utility positively', () => {
    const context = createMockContext({
      perception: {
        ...createMockContext().perception,
        nearbyResources: [{ id: 'res-1', type: 'FISH', quantity: 15 }] as any
      }
    });
    
    const candidates = createCandidateSet([{ type: ActionType.GO_TO_FOOD_SOURCE, source: 'HUNGER', target: { type: 'RESOURCE', id: 'res-1' }, reason: '' }]);
    const result = engine.evaluate(candidates, context);
    
    expect(result.rankedActions[0].breakdown.resourceAvailability).toBe(15);
  });

  it('TEST 18 & 19 & 21: Stubs provide neutral contributions (Personality, Env, Job, Trans, Energy, Duration)', () => {
    const context = createMockContext();
    const candidates = createCandidateSet([{ type: ActionType.WORK, source: 'WORK_SCHEDULE', reason: '' }]);
    const result = engine.evaluate(candidates, context);
    
    const bd = result.rankedActions[0].breakdown;
    expect(bd.personality).toBe(0);
    expect(bd.environment).toBe(0);
    expect(bd.job).toBe(0);
    expect(bd.transportation).toBe(0);
    expect(bd.energy).toBe(0);
    expect(bd.duration).toBe(0);
  });

  it('TEST 22 & 23 & 24: Candidates are ranked correctly, highest is selected, tie-breaking deterministic', () => {
    const context = createMockContext({
      vitalState: { ...createMockContext().vitalState, hunger: 60, thirst: 60 } // Equal need urgency
    });
    
    const candidates = createCandidateSet([
      { type: ActionType.REST, source: 'ENERGY', reason: '' }, // 50 energy -> 50 base * 1.0 = 50
      { type: ActionType.EAT, source: 'HUNGER', reason: '' }, // 60 hunger -> 60 base * 1.0 = 60
      { type: ActionType.DRINK, source: 'THIRST', reason: '' } // 60 thirst -> 60 base * 1.0 = 60
    ]);

    const result = engine.evaluate(candidates, context);
    
    // DRINK and EAT tie at 60. Deterministic tie breaker: ActionType alphabet.
    // 'DRINK' < 'EAT', so DRINK should be selected.
    expect(result.rankedActions.length).toBe(3);
    expect(result.selectedAction.type).toBe(ActionType.DRINK);
    expect(result.rankedActions[0].action.type).toBe(ActionType.DRINK);
    expect(result.rankedActions[1].action.type).toBe(ActionType.EAT);
    expect(result.rankedActions[2].action.type).toBe(ActionType.REST);
    
    expect(result.rankedActions[0].rank).toBe(1);
    expect(result.rankedActions[1].rank).toBe(2);
    expect(result.rankedActions[2].rank).toBe(3);
  });

  it('TEST 26 & 27 & 28 & 29: Utility evaluation does not mutate citizen, world, perception, resources', () => {
    const context = createMockContext();
    const originalContextJson = JSON.stringify(context);
    
    const candidates = createCandidateSet([{ type: ActionType.EAT, source: 'HUNGER', reason: '' }]);
    engine.evaluate(candidates, context);
    
    expect(JSON.stringify(context)).toBe(originalContextJson);
  });

  it('TEST 30: IDLE is selected when it is the only valid candidate and gets baseline score', () => {
    const context = createMockContext();
    const candidates = createCandidateSet([{ type: ActionType.IDLE, source: 'FALLBACK', reason: '' }]);
    const result = engine.evaluate(candidates, context);
    
    expect(result.selectedAction.type).toBe(ActionType.IDLE);
    expect(result.rankedActions[0].score).toBe(10);
  });

  it('SCENARIO A: Hungry worker evaluates all correctly', () => {
    const context = createMockContext({
      vitalState: { ...createMockContext().vitalState, hunger: 70 }, // HIGH -> 70 * 1.5 = 105
      perception: {
        ...createMockContext().perception,
        schedule: { currentActivity: 'WORK' } as any
      }
    });
    
    const candidates = createCandidateSet([
      { type: ActionType.EAT, source: 'HUNGER', reason: '' },
      { type: ActionType.GO_TO_WORK, source: 'WORK_SCHEDULE', reason: '' }
    ]);
    
    const result = engine.evaluate(candidates, context);
    
    // GO_TO_WORK schedule bonus = 40
    // EAT hunger bonus = 100 (clamped)
    
    expect(result.selectedAction.type).toBe(ActionType.EAT);
    expect(result.rankedActions.find(r => r.action.type === ActionType.GO_TO_WORK)?.score).toBe(40);
  });
});
