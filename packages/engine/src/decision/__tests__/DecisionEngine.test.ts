import { ActionType, DecisionContext, DecisionTriggerType, EmploymentStatus, CandidateActionSet } from '@genesis/shared';
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
    const actions: CandidateActionSet = {
      citizenId: 'cit-1', timestamp: new Date(), triggeredNeeds: [], candidates: [
        { type: ActionType.CONSUME_FOOD, source: 'HUNGER', reason: '' },
        { type: ActionType.REST, source: 'ENERGY', reason: '' }
      ]
    };
    
    const decision1 = engine.requestDecision(context, actions, DecisionTriggerType.PERIODIC_FALLBACK);
    const decision2 = engine.requestDecision(context, actions, DecisionTriggerType.PERIODIC_FALLBACK);
    
    expect(decision1.selectedAction.type).toBe(decision2.selectedAction.type);
    expect(decision1.rankedActions[0].score).toBe(decision2.rankedActions[0].score);
  });

  it('TEST 3: Highest-scoring action is selected', () => {
    const context = createMockContext({ vitalState: { ...createMockContext().vitalState, hunger: 90, energy: 100 } });
    const actions: CandidateActionSet = {
      citizenId: 'cit-1', timestamp: new Date(), triggeredNeeds: [], candidates: [
        { type: ActionType.CONSUME_FOOD, source: 'HUNGER', reason: '' },
        { type: ActionType.REST, source: 'ENERGY', reason: '' }
      ]
    };
    const decision = engine.requestDecision(context, actions, DecisionTriggerType.EVENT_DRIVEN);
    
    expect(decision.selectedAction.type).toBe(ActionType.CONSUME_FOOD);
  });

  it('TEST 8 & 9: Decision record is generated and history is bounded', () => {
    const context = createMockContext();
    const actions: CandidateActionSet = {
      citizenId: 'cit-1', timestamp: new Date(), triggeredNeeds: [], candidates: [
        { type: ActionType.REST, source: 'ENERGY', reason: '' }
      ]
    };
    
    // Generate 55 decisions
    for (let i = 0; i < 55; i++) {
      engine.requestDecision(context, actions, DecisionTriggerType.EVENT_DRIVEN);
    }

    const history = engine.getHistory('citizen-1');
    expect(history.length).toBe(50); // Bounded at 50
    expect(history[0].candidateActions).toContain(ActionType.REST);
  });

  it('TEST 10 & 11 & 12: Triggers can be represented (event-driven, fallback)', () => {
    const context = createMockContext();
    const actions: CandidateActionSet = {
      citizenId: 'cit-1', timestamp: new Date(), triggeredNeeds: [], candidates: [
        { type: ActionType.REST, source: 'ENERGY', reason: '' }
      ]
    };
    const decision1 = engine.requestDecision(context, actions, DecisionTriggerType.EVENT_DRIVEN);
    expect(decision1.reasoning?.trigger).toBe(DecisionTriggerType.EVENT_DRIVEN);

    const decision2 = engine.requestDecision(context, actions, DecisionTriggerType.PERIODIC_FALLBACK);
    expect(decision2.reasoning?.trigger).toBe(DecisionTriggerType.PERIODIC_FALLBACK);
  });

  it('TEST 15 & 16 & 17: Decision Engine does not mutate world, just selects action', () => {
    const context = createMockContext();
    const originalLocation = context.currentLocationId;
    const actions: CandidateActionSet = {
      citizenId: 'cit-1', timestamp: new Date(), triggeredNeeds: [], candidates: [
        { type: ActionType.GO_TO_WORK, source: 'WORK_SCHEDULE', reason: '' }
      ]
    };
    
    const decision = engine.requestDecision(context, actions, DecisionTriggerType.EVENT_DRIVEN);
    
    expect(decision.selectedAction.type).toBe(ActionType.GO_TO_WORK);
    expect(context.currentLocationId).toBe(originalLocation);
    const history = engine.getHistory('citizen-1');
    expect(history[0].result).toBe('DEFERRED'); // Phase 4.4 defers execution
  });
});
