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
          this.generateHungerCandidates(need, context, candidates);
          break;
        case 'THIRST':
          this.generateThirstCandidates(need, context, candidates);
          break;
        case 'ENERGY':
          this.generateEnergyCandidates(need, candidates);
          break;
        case 'HEALTH':
          this.generateHealthCandidates(need, context, candidates);
          break;
      }
    }

    // 2. Generate Schedule-based actions
    this.generateScheduleCandidates(context, candidates);

    return candidates;
  }

  private generateHungerCandidates(need: NeedState, context: DecisionContext, candidates: CandidateAction[]) {
    const wheatStock = context.stockLevels?.['wheat'] || 0;
    const fishStock = context.stockLevels?.['raw_fish'] || 0;
    const totalFoodStock = wheatStock + fishStock;

    if (need.level === NeedUrgencyLevel.VERY_LOW) return;

    // Always can CONSUME_FOOD if they have either food
    if (totalFoodStock > 0) {
      candidates.push({
        type: ActionType.CONSUME_FOOD,
        source: need.needType,
        reason: `Hunger is ${need.level} and food is available`
      });
    }

    // Determine if we need to purchase based on stock and need
    let shouldPurchase = false;
    let purchaseReason = '';
    
    // Emergency: Critical need and no food
    if (need.urgency >= 80 && totalFoodStock <= 0) {
      shouldPurchase = true;
      purchaseReason = `EMERGENCY: Hunger is ${need.level} and no food in stock`;
    }
    // Reactive: Moderate need and low food stock
    else if (need.urgency >= 40 && totalFoodStock < 5) {
      shouldPurchase = true;
      purchaseReason = `REACTIVE: Hunger is ${need.level} and food stock is running low (${totalFoodStock})`;
    }
    // Planned: Low need but food stock is getting very low
    else if (totalFoodStock < 2) {
      shouldPurchase = true;
      purchaseReason = `PLANNED: Food stock is very low (${totalFoodStock}), planning procurement`;
    }

    if (shouldPurchase) {
      // 1. Primary candidate (Wheat)
      candidates.push({
        type: ActionType.PURCHASE,
        source: need.needType,
        reason: purchaseReason,
        metadata: {
          productId: 'wheat',
          targetQuantity: 10,
          expectedPrice: 10
        }
      });

      // 2. Substitute candidate (Raw Fish)
      candidates.push({
        type: ActionType.PURCHASE,
        source: need.needType,
        reason: `${purchaseReason} (Substitute)`,
        metadata: {
          productId: 'raw_fish',
          targetQuantity: 7, // equivalent restoration ~210 vs ~200
          expectedPrice: 15
        }
      });
    }

    // Optional: SEEK_FOOD for immediate scavenging if purchase isn't the only option
    if (need.urgency > 40 && totalFoodStock <= 0) {
      const perception = context.perception;
      const foodResource = perception?.nearbyResources?.find((r: any) => r.type === 'FISH' || r.type === 'WILDLIFE');
      if (foodResource) {
        candidates.push({
          type: ActionType.GO_TO_FOOD_SOURCE,
          source: need.needType,
          reason: `Hunger is ${need.level} and food source perceived`,
          target: { type: 'RESOURCE', id: foodResource.id }
        });
      }
    }
  }

  private generateThirstCandidates(need: NeedState, context: DecisionContext, candidates: CandidateAction[]) {
    const perception = context.perception;
    const waterStock = context.stockLevels?.['water'] || 0;

    if (need.level === NeedUrgencyLevel.VERY_LOW) return;

    if (waterStock > 0) {
      candidates.push({
        type: ActionType.CONSUME_WATER,
        source: need.needType,
        reason: `Thirst is ${need.level} and water is available`
      });
    }

    let shouldPurchase = false;
    let purchaseReason = '';
    
    // Emergency
    if (need.urgency >= 80 && waterStock <= 0) {
      shouldPurchase = true;
      purchaseReason = `EMERGENCY: Thirst is ${need.level} and no water in stock`;
    }
    // Reactive
    else if (need.urgency >= 40 && waterStock < 10) {
      shouldPurchase = true;
      purchaseReason = `REACTIVE: Thirst is ${need.level} and water stock is running low (${waterStock})`;
    }
    // Planned
    else if (waterStock < 5) {
      shouldPurchase = true;
      purchaseReason = `PLANNED: Water stock is very low (${waterStock}), planning procurement`;
    }

    if (shouldPurchase) {
      candidates.push({
        type: ActionType.PURCHASE,
        source: need.needType,
        reason: purchaseReason,
        metadata: {
          productId: 'water',
          targetQuantity: 20
        }
      });
    }

    if (need.urgency > 40 && waterStock <= 0) {
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

  private generateHealthCandidates(need: NeedState, context: DecisionContext, candidates: CandidateAction[]) {
    if (need.level === NeedUrgencyLevel.VERY_LOW || need.level === NeedUrgencyLevel.LOW) return;

    const perception = context.perception;
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
    let actionType = ActionType.IDLE;

    if (activity.type === 'WORK') {
      if (context.employmentStatus === 'EMPLOYED' && context.workplaceLocationId) {
        target = { type: 'BUILDING', id: context.workplaceLocationId };
        actionType = context.currentLocationId !== context.workplaceLocationId ? ActionType.GO_TO_WORK : ActionType.WORK;
      }
    } else if (activity.type === 'STUDY') {
      // School candidates are intentionally omitted as the domain model lacks school relationships (Reported gap).
      return; 
    } else if (activity.type === 'SLEEP' || activity.type === 'REST') {
      if (context.homeId) {
        target = { type: 'BUILDING', id: context.homeId };
        actionType = context.currentLocationId !== context.homeId ? ActionType.GO_HOME : ActionType.REST;
      } else {
        actionType = ActionType.REST;
      }
    } else if (activity.type === 'MEAL') {
      actionType = ActionType.CONSUME_FOOD;
      if (context.homeId && context.currentLocationId !== context.homeId) {
         // Also propose GO_HOME as a candidate since people often eat at home
         const goHomeAction = ActionType.GO_HOME;
         const goHomeTarget = { type: 'BUILDING', id: context.homeId };
         if (!candidates.some(c => c.type === goHomeAction && c.target?.id === goHomeTarget.id)) {
            candidates.push({
              type: goHomeAction,
              source: 'ROUTINE',
              reason: `Scheduled routine activity: MEAL - Going home to eat`,
              target: goHomeTarget
            });
         }
      }
    }

    if (actionType !== ActionType.IDLE) {
      const isDuplicate = candidates.some(c => 
        c.type === actionType && 
        c.target?.id === target?.id && 
        c.target?.type === target?.type
      );

      if (!isDuplicate) {
        candidates.push({
          type: actionType,
          source: 'ROUTINE',
          reason: `Scheduled routine activity: ${activity.type}`,
          target
        });
      }
    }
  }
}
