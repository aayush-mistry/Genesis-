import { ActionType, DecisionContext, DecisionTriggerType, EmploymentStatus } from '@genesis/shared';
import { DecisionEngine } from '../DecisionEngine';
import { ScoreUtils } from '../scoring/ScoreUtils';
import { DecisionSelector } from '../DecisionSelector';

describe('AI Decision Framework (Phase 4.1)', () => {
  let engine: DecisionEngine;

  const createMockContext = (overrides: Partial<DecisionContext> = {}): DecisionContext => ({
    citizenId: 'citizen-1',
    age: 30,
    vitalState: { hunger: 50, thirst: 50, energy: 50, health: 100, lastUpdatedSimulationTime: { year: 1, month: 1, day: 1, hour: 0, minute: 0, second: 0 } },
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

  beforeEach(() => {
    engine = new DecisionEngine();
  });

  it('TEST 1 & 19: Score is always clamped safely between 0 and 100', () => {
    expect(ScoreUtils.clampScore(-50)).toBe(0);
    expect(ScoreUtils.clampScore(150)).toBe(100);
    expect(ScoreUtils.clampScore(75)).toBe(75);
  });

  it('TEST 2 & 18: Deterministic scoring produces the same decision for same state', () => {
    const context = createMockContext({ vitalState: { ...createMockContext().vitalState, hunger: 90 } });
    const actions = [{ type: ActionType.EAT }, { type: ActionType.REST }];
    
    const decision1 = engine.requestDecision('cit-1', context, actions, DecisionTriggerType.PERIODIC_FALLBACK);
    const decision2 = engine.requestDecision('cit-1', context, actions, DecisionTriggerType.PERIODIC_FALLBACK);
    
    expect(decision1.score).toBe(decision2.score);
    expect(decision1.action.type).toBe(decision2.action.type);
  });

  it('TEST 3: Highest-scoring action is selected', () => {
    // A context where hunger is 90 (starving) and energy is 100 (not tired)
    const context = createMockContext({ vitalState: { ...createMockContext().vitalState, hunger: 90, energy: 100 } });
    const actions = [{ type: ActionType.EAT }, { type: ActionType.REST }];
    const decision = engine.requestDecision('cit-1', context, actions, DecisionTriggerType.EVENT_DRIVEN);
    
    expect(decision.action.type).toBe(ActionType.EAT);
  });

  it('TEST 4: Equal scores are resolved deterministically', () => {
    const selector = new DecisionSelector();
    // Simulate equal scores. "DRINK" comes before "EAT" alphabetically.
    const evaluated = [
      { action: { type: ActionType.EAT }, score: 50 },
      { action: { type: ActionType.DRINK }, score: 50 }
    ];
    
    const best = selector.selectBestAction(evaluated, createMockContext());
    expect(best.action.type).toBe(ActionType.DRINK); // Because D < E
  });

  it('TEST 5: REST is available as fallback', () => {
    const context = createMockContext({ vitalState: { ...createMockContext().vitalState, hunger: 0, energy: 100 } });
    const actions = [{ type: ActionType.EAT }, { type: ActionType.REST }];
    const decision = engine.requestDecision('cit-1', context, actions, DecisionTriggerType.PERIODIC_FALLBACK);
    
    // Eat is 0 score, REST has a minimum fallback score (20)
    expect(decision.action.type).toBe(ActionType.REST);
    expect(decision.score).toBeGreaterThan(0);
  });

  it('TEST 6: No IDLE action exists in ActionType', () => {
    expect((ActionType as any).IDLE).toBeUndefined();
    expect(Object.values(ActionType).includes('IDLE' as any)).toBe(false);
  });

  it('TEST 7: Decision context can be created', () => {
    const context = createMockContext();
    expect(context).toBeDefined();
    expect(context.citizenId).toBe('citizen-1');
  });

  it('TEST 8 & 9: Decision record is generated and history is bounded', () => {
    const context = createMockContext();
    const actions = [{ type: ActionType.REST }];
    
    // Generate 55 decisions
    for (let i = 0; i < 55; i++) {
      engine.requestDecision('cit-1', context, actions, DecisionTriggerType.EVENT_DRIVEN);
    }

    const history = engine.getHistory('cit-1');
    expect(history.length).toBe(50); // Bounded at 50
    expect(history[0].citizenId).toBe('cit-1');
    expect(history[0].candidateActions).toContain(ActionType.REST);
  });

  it('TEST 10 & 11 & 12: Triggers can be represented (event-driven, fallback)', () => {
    const context = createMockContext();
    const decision1 = engine.requestDecision('cit-1', context, [{ type: ActionType.REST }], DecisionTriggerType.EVENT_DRIVEN);
    expect(decision1.reasoning.trigger).toBe(DecisionTriggerType.EVENT_DRIVEN);

    const decision2 = engine.requestDecision('cit-1', context, [{ type: ActionType.REST }], DecisionTriggerType.PERIODIC_FALLBACK);
    expect(decision2.reasoning.trigger).toBe(DecisionTriggerType.PERIODIC_FALLBACK);
  });

  it('TEST 13 & 14 & 22: Citizen chooses food when hungry, and work when not (Integration Scenario)', () => {
    const actions = [{ type: ActionType.EAT }, { type: ActionType.GO_TO_WORK }, { type: ActionType.REST }];
    
    // Scenario A: High hunger (90), medium work urgency (60 based on employed status)
    let context = createMockContext({ vitalState: { ...createMockContext().vitalState, hunger: 90 } });
    let decision = engine.requestDecision('cit-1', context, actions, DecisionTriggerType.NEED_THRESHOLD_CROSSED);
    
    expect(decision.action.type).toBe(ActionType.EAT);
    expect(decision.score).toBe(90);

    // Scenario B: Low hunger (20), work is active
    context = createMockContext({ vitalState: { ...createMockContext().vitalState, hunger: 20 }, workUrgency: 85 });
    decision = engine.requestDecision('cit-1', context, actions, DecisionTriggerType.SCHEDULE_START);
    
    expect(decision.action.type).toBe(ActionType.GO_TO_WORK);
    expect(decision.score).toBe(85);
  });

  it('TEST 15 & 16 & 17: Decision Engine does not mutate world, just selects action', () => {
    const context = createMockContext();
    const originalLocation = context.currentLocationId;
    
    const decision = engine.requestDecision('cit-1', context, [{ type: ActionType.GO_TO_WORK }], DecisionTriggerType.EVENT_DRIVEN);
    
    expect(decision.action.type).toBe(ActionType.GO_TO_WORK);
    // Context is completely unmodified
    expect(context.currentLocationId).toBe(originalLocation);
    // Execute returns SUCCESS but doesn't change anything internally
    const history = engine.getHistory('cit-1');
    expect(history[0].result).toBe('SUCCESS'); 
  });
});
