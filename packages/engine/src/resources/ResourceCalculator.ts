import { Resource, ResourceType, ResourceCategory } from '@genesis/shared';
import { EnvironmentalState, WeatherData, SeasonType, DayPhaseType } from '@genesis/shared';

export class ResourceCalculator {
  
  /**
   * Calculates the regenerated state of a resource over a given number of hours.
   * Deterministic function.
   */
  public calculateRegeneration(
    resource: Resource,
    envState: EnvironmentalState | null,
    weather: WeatherData | null,
    season: SeasonType,
    dayPhase: DayPhaseType,
    hoursElapsed: number
  ): Partial<Resource> {
    if (resource.category === ResourceCategory.NON_RENEWABLE) {
      return {}; // Non-renewable resources do not regenerate
    }

    if (hoursElapsed <= 0) return {};

    let modifier = 1.0;

    // Environmental Modifiers
    if (envState) {
      // Temperature extremes can slow down biological growth
      if (resource.type === ResourceType.FORESTS || resource.type === ResourceType.GRASSLANDS || resource.type === ResourceType.WILDLIFE) {
        if (envState.temperature < 0 || envState.temperature > 40) {
          modifier *= 0.5; // Slow growth in extreme temps
        } else if (envState.temperature >= 15 && envState.temperature <= 25) {
          modifier *= 1.2; // Optimal growth
        }
      }
      
      // Water regeneration heavily depends on humidity and lack of extreme heat
      if (resource.type === ResourceType.WATER) {
        if (envState.humidity > 80) modifier *= 1.2;
        if (envState.temperature > 35) modifier *= 0.7; // Evaporation
      }
    }

    // Weather Modifiers
    if (weather) {
      if (resource.type === ResourceType.WATER) {
        if (weather.currentType === 'Rain' || weather.currentType === 'Heavy Snow') modifier *= 2.0;
        if (weather.currentType === 'Storm') modifier *= 2.5;
        if (weather.currentType === 'Sunny' && envState && envState.temperature > 30) modifier *= 0.8; // High evap
      }
      if (resource.type === ResourceType.FORESTS || resource.type === ResourceType.GRASSLANDS) {
        if (weather.currentType === 'Rain') modifier *= 1.5;
      }
    }

    // Seasonal Modifiers
    if (resource.type === ResourceType.FORESTS || resource.type === ResourceType.GRASSLANDS || resource.type === ResourceType.WILDLIFE) {
      if (season === 'Spring') modifier *= 1.5;
      else if (season === 'Winter') modifier *= 0.3; // Dormant
    }

    // Day Phase Modifiers
    if (resource.type === ResourceType.SOLAR_POTENTIAL) {
      if (dayPhase === 'Night') modifier = 0; // No solar at night
      else if (dayPhase === 'Afternoon' && weather?.currentType === 'Sunny') modifier = 1.0;
      else modifier = 0.5;
    }

    // The base regeneration rate is per tick (usually 1 hour)
    const baseRegen = resource.naturalRecoveryRate ?? 0;
    const generatedAmount = baseRegen * modifier * hoursElapsed;
    
    // Calculate new quantity with cap
    const consumption = resource.consumptionRate ?? 0;
    let newQuantity = resource.currentAmount + generatedAmount - (consumption * hoursElapsed);
    
    // Clamp to boundaries
    if (newQuantity > resource.maximumAmount) newQuantity = resource.maximumAmount;
    if (newQuantity < 0) newQuantity = 0;

    const updates: Partial<Resource> = {
      currentAmount: newQuantity,
    };

    // Quality changes based on extremes (health of forests etc.)
    if (resource.condition !== null && (resource.type === ResourceType.FORESTS || resource.type === ResourceType.WILDLIFE)) {
       let newHealth = resource.condition.value;
       if (envState && envState.temperature > 40 && envState.humidity < 20) {
         newHealth -= 0.01 * hoursElapsed; // Drought damage
       } else if (modifier >= 1.2) {
         newHealth += 0.005 * hoursElapsed; // Recovery
       }
       if (newHealth > 1.0) newHealth = 1.0;
       if (newHealth < 0) newHealth = 0;
       
       updates.condition = {
         type: resource.condition.type,
         value: newHealth
       };
    }

    return updates;
  }
}
