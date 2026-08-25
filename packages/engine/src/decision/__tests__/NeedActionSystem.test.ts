import { NeedActionSystem } from '../NeedActionSystem';
import { ActionType, DecisionContext, EmploymentStatus, VitalState, NeedUrgencyLevel } from '@genesis/shared';

describe('NeedActionSystem', () => {
  let system: NeedActionSystem;
  let mockContext: DecisionContext;

  beforeEach(() => {
    system = new NeedActionSystem();
    const vitals: VitalState = {
      hunger: 0,
      thirst: 0,
      energy: 100,
      health: 100,
      lastUpdatedSimulationTime: { year: 1, month: 1, day: 1, hour: 0, minute: 0, second: 0 }
    };

    mockContext = {
      citizenId: 'c1',
      age: 30,
      vitalState: vitals,
      skills: [],
      employmentStatus: EmploymentStatus.EMPLOYED,
      workplaceId: 'b1',
      currentLocationId: 'home1',
      currentDestinationId: null,
      simulationTime: new Date(),
      perception: {
        timestamp: new Date(),
        citizenId: 'c1',
        self: { citizenId: 'c1', age: 30, vitalState: vitals, employmentStatus: EmploymentStatus.EMPLOYED, workplaceId: 'b1', activeRoute: null },
        location: { worldId: 'w1', regionId: 'r1', cityId: 'city1', districtId: null, buildingId: 'home1', coordinates: { x: 0, y: 0 } },
        environment: { season: 'Spring', weather: 'Sunny', temperature: 20, humidity: 50, dayPhase: 'Morning' },
        nearbyResources: [],
        nearbyBuildings: [],
        nearbyEntities: [],
        schedule: { currentTime: { year: 1, month: 1, day: 1, hour: 10, minute: 0, second: 0 }, currentActivity: null, nextActivity: null }
      }
    };
  });

  describe('Thresholds and Need states', () => {
    it('inverts energy and health correctly', () => {
      mockContext.vitalState.hunger = 95; // CRITICAL
      mockContext.vitalState.thirst = 30; // LOW
      mockContext.vitalState.energy = 5;  // CRITICAL (inverted: 100 - 5 = 95)
      mockContext.vitalState.health = 90; // VERY_LOW (inverted: 100 - 90 = 10)

      const result = system.generateCandidateActions(mockContext);
      
      const hungerState = result.triggeredNeeds.find(n => n.needType === 'HUNGER');
      expect(hungerState?.level).toBe(NeedUrgencyLevel.CRITICAL);
      expect(hungerState?.urgency).toBe(95);

      const energyState = result.triggeredNeeds.find(n => n.needType === 'ENERGY');
      expect(energyState?.level).toBe(NeedUrgencyLevel.CRITICAL);
      expect(energyState?.urgency).toBe(95);

      const healthState = result.triggeredNeeds.find(n => n.needType === 'HEALTH');
      expect(healthState?.level).toBe(NeedUrgencyLevel.VERY_LOW);
      expect(healthState?.urgency).toBe(10);
    });
  });

  describe('Needs -> Actions', () => {
    it('generates EAT and SEEK_FOOD for high hunger', () => {
      mockContext.vitalState.hunger = 75; // HIGH
      const result = system.generateCandidateActions(mockContext);
      
      const actions = result.candidates.map(c => c.type);
      expect(actions).toContain(ActionType.CONSUME_FOOD);
      expect(actions).toContain(ActionType.SEEK_FOOD);
      expect(actions).not.toContain(ActionType.GO_TO_FOOD_SOURCE); // No food source nearby
    });

    it('generates GO_TO_FOOD_SOURCE if food source exists', () => {
      mockContext.vitalState.hunger = 75;
      mockContext.perception.nearbyResources.push({
        id: 'fish1', type: 'FISH' as any, quantity: 10, distance: 5, coordinates: {x: 5, y: 5}
      });
      const result = system.generateCandidateActions(mockContext);
      
      const actions = result.candidates.map(c => c.type);
      expect(actions).toContain(ActionType.GO_TO_FOOD_SOURCE);
    });

    it('generates REST for low energy', () => {
      mockContext.vitalState.energy = 20; // HIGH urgency
      const result = system.generateCandidateActions(mockContext);
      
      const actions = result.candidates.map(c => c.type);
      expect(actions).toContain(ActionType.REST);
    });

    it('generates SEEK_MEDICAL_HELP for low health if hospital nearby', () => {
      mockContext.vitalState.health = 40; // HIGH urgency
      mockContext.perception.nearbyBuildings.push({
        id: 'hosp1', type: 'HOSPITAL', distance: 10, coordinates: {x: 0, y: 0}
      });
      const result = system.generateCandidateActions(mockContext);
      
      const actions = result.candidates.map(c => c.type);
      expect(actions).toContain(ActionType.SEEK_MEDICAL_HELP);
    });
  });

  describe('Schedule Actions', () => {
    it('generates GO_TO_WORK if schedule says WORK and not at workplace', () => {
      mockContext.currentRoutineActivity = { id: 'act1', type: 'WORK' as any, startTime: 0, endTime: 24, interruptible: true, destinationType: 'WORKPLACE' };
      mockContext.currentLocationId = 'home1';
      mockContext.workplaceId = 'work1';
      
      const result = system.generateCandidateActions(mockContext);
      const actions = result.candidates.map(c => c.type);
      
      expect(actions).toContain(ActionType.GO_TO_WORK);
      expect(actions).not.toContain(ActionType.WORK);
    });

    it('generates WORK if schedule says WORK and already at workplace', () => {
      mockContext.currentRoutineActivity = { id: 'act1', type: 'WORK' as any, startTime: 0, endTime: 24, interruptible: true, destinationType: 'WORKPLACE' };
      mockContext.workplaceId = 'work1';
      mockContext.currentLocationId = 'work1'; // At work
      
      const result = system.generateCandidateActions(mockContext);
      const actions = result.candidates.map(c => c.type);
      
      expect(actions).toContain(ActionType.WORK);
      expect(actions).not.toContain(ActionType.GO_TO_WORK);
    });
  });

  describe('Eligibility', () => {
    it('prevents GO_TO_WORK for citizens above 75', () => {
      mockContext.age = 80;
      mockContext.currentRoutineActivity = { id: 'act1', type: 'WORK' as any, startTime: 0, endTime: 24, interruptible: true, destinationType: 'WORKPLACE' };
      mockContext.workplaceId = 'work1';
      mockContext.currentLocationId = 'home1';
      
      const result = system.generateCandidateActions(mockContext);
      const actions = result.candidates.map(c => c.type);
      
      expect(actions).not.toContain(ActionType.GO_TO_WORK);
    });

    it('prevents GO_TO_WORK for citizens below 18', () => {
      mockContext.age = 12;
      mockContext.currentRoutineActivity = { id: 'act1', type: 'WORK' as any, startTime: 0, endTime: 24, interruptible: true, destinationType: 'WORKPLACE' };
      mockContext.workplaceId = 'work1';
      
      const result = system.generateCandidateActions(mockContext);
      const actions = result.candidates.map(c => c.type);
      
      expect(actions).not.toContain(ActionType.GO_TO_WORK);
    });
  });

  describe('IDLE Fallback', () => {
    it('generates IDLE if no valid actions exist', () => {
      const result = system.generateCandidateActions(mockContext);
      
      expect(result.candidates.length).toBe(1);
      expect(result.candidates[0].type).toBe(ActionType.IDLE);
    });

    it('does NOT generate IDLE if other valid actions exist', () => {
      mockContext.vitalState.hunger = 95; // Will generate EAT
      const result = system.generateCandidateActions(mockContext);
      
      const actions = result.candidates.map(c => c.type);
      expect(actions).toContain(ActionType.CONSUME_FOOD);
      expect(actions).not.toContain(ActionType.IDLE);
    });
  });
});
