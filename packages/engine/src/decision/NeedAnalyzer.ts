import { VitalState, NeedState, NeedUrgencyLevel } from '@genesis/shared';

export class NeedAnalyzer {
  /**
   * Deterministically calculates need states from a citizen's VitalState.
   * Rules:
   * - Hunger/Thirst: Higher value = higher urgency.
   * - Health/Energy: Lower value = higher urgency.
   */
  public analyzeNeeds(vitals: VitalState): NeedState[] {
    const states: NeedState[] = [];

    // Hunger (0 = full, 100 = starving)
    states.push(this.createNeedState('HUNGER', vitals.hunger, false));

    // Thirst (0 = hydrated, 100 = dehydrated)
    states.push(this.createNeedState('THIRST', vitals.thirst, false));

    // Energy (0 = exhausted, 100 = rested)
    states.push(this.createNeedState('ENERGY', vitals.energy, true));

    // Health (0 = dead, 100 = healthy)
    states.push(this.createNeedState('HEALTH', vitals.health, true));

    return states;
  }

  private createNeedState(needType: string, rawValue: number, inverted: boolean): NeedState {
    const urgency = inverted ? 100 - rawValue : rawValue;
    const clampedUrgency = Math.max(0, Math.min(100, urgency));
    
    return {
      needType,
      rawValue,
      urgency: clampedUrgency,
      level: this.determineLevel(clampedUrgency)
    };
  }

  private determineLevel(urgency: number): NeedUrgencyLevel {
    if (urgency <= 20) return NeedUrgencyLevel.VERY_LOW;
    if (urgency <= 40) return NeedUrgencyLevel.LOW;
    if (urgency <= 60) return NeedUrgencyLevel.MODERATE;
    if (urgency <= 80) return NeedUrgencyLevel.HIGH;
    return NeedUrgencyLevel.CRITICAL;
  }
}
