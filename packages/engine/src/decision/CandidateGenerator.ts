import { ActionType, CandidateAction, DecisionContext, NeedState, NeedUrgencyLevel, PerceptionSnapshot } from '@genesis/shared';

export class CandidateGenerator {
  /**
   * Generates initial raw candidate actions based on NeedStates and Context.
   * Does NOT check strict eligibility (like age or exact reachability) yet,
   * but does require a perceived target to generate destination actions.
   */
  public generateCandidates(context: DecisionContext, needStates: NeedState[]): CandidateAction[] {
    const candidates: CandidateAction[] = [];
    const perception = context.perception;

    // 1. Generate Need-based actions
    for (const need of needStates) {
      switch (need.needType) {
        case 'HUNGER':
          this.generateHungerCandidates(need, perception, candidates);
          break;
        case 'THIRST':
          this.generateThirstCandidates(need, perception, candidates);
          break;
        case 'ENERGY':
          this.generateEnergyCandidates(need, candidates);
          break;
        case 'HEALTH':
          this.generateHealthCandidates(need, perception, candidates);
          break;
      }
    }

    // 2. Generate Schedule-based actions
    this.generateScheduleCandidates(context, candidates);

    return candidates;
  }

  private generateHungerCandidates(need: NeedState, perception: PerceptionSnapshot, candidates: CandidateAction[]) {
    if (need.level === NeedUrgencyLevel.VERY_LOW) return;

    // Always can EAT if they have food (or as a generic action)
    candidates.push({
      type: ActionType.EAT,
      source: need.needType,
      reason: `Hunger is ${need.level}`
    });

    if (need.urgency > 40) { // MODERATE, HIGH, CRITICAL
      candidates.push({
        type: ActionType.SEEK_FOOD,
        source: need.needType,
        reason: `Hunger is ${need.level}`
      });

      // Find a known food source (e.g. food resources or restaurants in buildings)
      // Assuming FISH and WILDLIFE act as food sources for now, or just look for 'FARM' buildings
      const foodResource = perception.nearbyResources.find(r => r.type === 'FISH' || r.type === 'WILDLIFE');
      
      if (foodResource) {
        candidates.push({
          type: ActionType.GO_TO_FOOD_SOURCE,
          source: need.needType,
          reason: `Hunger is ${need.level} and food source perceived`,
          target: { type: 'RESOURCE', id: foodResource.id }
        });
      } else {
        const farm = perception.nearbyBuildings.find(b => b.type === 'FARM' || b.type === 'RESTAURANT');
        if (farm) {
          candidates.push({
            type: ActionType.GO_TO_FOOD_SOURCE,
            source: need.needType,
            reason: `Hunger is ${need.level} and food source perceived`,
            target: { type: 'BUILDING', id: farm.id }
          });
        }
      }
    }
  }

  private generateThirstCandidates(need: NeedState, perception: PerceptionSnapshot, candidates: CandidateAction[]) {
    if (need.level === NeedUrgencyLevel.VERY_LOW) return;

    candidates.push({
      type: ActionType.DRINK,
      source: need.needType,
      reason: `Thirst is ${need.level}`
    });

    if (need.urgency > 40) {
      candidates.push({
        type: ActionType.SEEK_WATER,
        source: need.needType,
        reason: `Thirst is ${need.level}`
      });

      const waterResource = perception.nearbyResources.find(r => r.type === 'WATER');
      if (waterResource) {
        candidates.push({
          type: ActionType.GO_TO_WATER_SOURCE,
          source: need.needType,
          reason: `Thirst is ${need.level} and water source perceived`,
          target: { type: 'RESOURCE', id: waterResource.id }
        });
      }
    }
  }

  private generateEnergyCandidates(need: NeedState, candidates: CandidateAction[]) {
    if (need.level === NeedUrgencyLevel.VERY_LOW) return;

    // Any drop in energy can prompt a REST action.
    candidates.push({
      type: ActionType.REST,
      source: need.needType,
      reason: `Energy is ${need.level}`
    });
  }

  private generateHealthCandidates(need: NeedState, perception: PerceptionSnapshot, candidates: CandidateAction[]) {
    if (need.level === NeedUrgencyLevel.VERY_LOW || need.level === NeedUrgencyLevel.LOW) return;

    const hospital = perception.nearbyBuildings.find(b => b.type === 'HOSPITAL' || b.type === 'CLINIC');
    
    if (hospital) {
      candidates.push({
        type: ActionType.SEEK_MEDICAL_HELP,
        source: need.needType,
        reason: `Health is ${need.level} and medical facility perceived`,
        target: { type: 'BUILDING', id: hospital.id }
      });
    }
  }

  private generateScheduleCandidates(context: DecisionContext, candidates: CandidateAction[]) {
    const schedule = context.perception.schedule;
    
    // Check Work
    if (schedule.currentActivity === 'WORK') {
      if (context.currentLocationId === context.workplaceId) {
        candidates.push({
          type: ActionType.WORK,
          source: 'WORK_SCHEDULE',
          reason: 'Currently at workplace during work hours'
        });
      } else {
        candidates.push({
          type: ActionType.GO_TO_WORK,
          source: 'WORK_SCHEDULE',
          reason: 'Work schedule is active but not at workplace',
          target: context.workplaceId ? { type: 'BUILDING', id: context.workplaceId } : undefined
        });
      }
    }

    // Check School
    if (schedule.currentActivity === 'SCHOOL' || schedule.currentActivity === 'STUDY') {
      // Simplification: We assume citizen has a schoolId in context or metadata, but for now we just use a generic check.
      const schoolId = context.schoolId; // If we had it
      if (schoolId && context.currentLocationId === schoolId) {
        candidates.push({
          type: ActionType.STUDY,
          source: 'SCHOOL_SCHEDULE',
          reason: 'Currently at school during study hours'
        });
      } else {
        candidates.push({
          type: ActionType.GO_TO_SCHOOL,
          source: 'SCHOOL_SCHEDULE',
          reason: 'School schedule is active',
          target: schoolId ? { type: 'BUILDING', id: schoolId } : undefined
        });
      }
    }
  }
}
