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

    // Always can CONSUME_FOOD if they have food (or as a generic action)
    candidates.push({
      type: ActionType.CONSUME_FOOD,
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
        const foodShops = perception.nearbyBuildings.filter(b => b.type === 'STORE' || b.type === 'RESTAURANT' || b.type === 'WHOLESALE' || b.type === 'RETAIL');
        for (const foodShop of foodShops) {
          // Generate go to action
          candidates.push({
            type: ActionType.GO_TO_FOOD_SOURCE,
            source: need.needType,
            reason: `Hunger is ${need.level} and food source perceived`,
            target: { type: 'BUILDING', id: foodShop.id }
          });

          // Generate purchase action
          candidates.push({
            type: ActionType.PURCHASE,
            source: need.needType,
            reason: `Hunger is ${need.level}, need to buy food`,
            target: { type: 'BUILDING', id: foodShop.id },
            metadata: {
              productId: 'wheat' // Simplified: they buy wheat or raw_fish for food
            }
          });
        }
      }
    }
  }

  private generateThirstCandidates(need: NeedState, perception: PerceptionSnapshot, candidates: CandidateAction[]) {
    if (need.level === NeedUrgencyLevel.VERY_LOW) return;

    candidates.push({
      type: ActionType.CONSUME_WATER,
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
    const activity = context.currentRoutineActivity;
    if (!activity) return;

    let target: { type: string, id: string } | undefined = undefined;

    // Resolve target if needed
    if (activity.destinationType === 'WORKPLACE' && context.workplaceId) {
      target = { type: 'BUILDING', id: context.workplaceId };
    } else if (activity.destinationType === 'SCHOOL') {
      // Stub for school logic
      if (context.schoolId) {
        target = { type: 'BUILDING', id: context.schoolId };
      }
    } else if (activity.destinationType === 'HOME') {
      // Stub for home logic
      if (context.homeId) {
        target = { type: 'BUILDING', id: context.homeId };
      }
    }

    // Map routine activity type to ActionType
    let actionType = ActionType.IDLE;
    switch (activity.type) {
      case 'WORK': actionType = target && context.currentLocationId !== target.id ? ActionType.GO_TO_WORK : ActionType.WORK; break;
      case 'STUDY': actionType = target && context.currentLocationId !== target.id ? ActionType.GO_TO_SCHOOL : ActionType.STUDY; break;
      case 'SLEEP': actionType = ActionType.REST; break; // SLEEP maps to REST
      case 'REST': actionType = ActionType.REST; break;
      case 'MEAL': actionType = ActionType.CONSUME_FOOD; break; // Needs will likely override or work together
      default: actionType = ActionType.IDLE; break;
    }

    // Always push the routine action as a baseline candidate
    candidates.push({
      type: actionType,
      source: 'ROUTINE',
      reason: `Scheduled routine activity: ${activity.type}`,
      target
    });
  }
}
