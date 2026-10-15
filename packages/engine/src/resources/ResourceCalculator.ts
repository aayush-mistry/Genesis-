import { Resource, ResourceType, ResourceCategory } from '@genesis/shared';
import { EnvironmentalState, WeatherData, SeasonType, DayPhaseType } from '@genesis/shared';

export class ResourceCalculator {
  
  /**
   * Supported renewable resource types for natural regeneration.
   */
  private static readonly SUPPORTED_RENEWABLES: (ResourceType | string)[] = [
    ResourceType.WATER,
    ResourceType.FORESTS,
    ResourceType.GRASSLANDS,
    ResourceType.WILDLIFE,
    ResourceType.FISH,
    ResourceType.SOLAR_POTENTIAL,
    ResourceType.WIND_POTENTIAL,
    ResourceType.HYDROELECTRIC_POTENTIAL
  ];

  /**
   * Calculates the regenerated state of a resource over a given number of hours.
   * Deterministic function strictly adhering to resource conservation and environmental inputs.
   */
  public calculateRegeneration(
    resource: Resource,
    envState: EnvironmentalState | null,
    weather: WeatherData | null,
    season: SeasonType,
    dayPhase: DayPhaseType,
    hoursElapsed: number
  ): Partial<Resource> {
    // 1. Strict guard: Non-renewable, operational, or unsupported resources cannot regenerate
    if (
      !resource.renewable ||
      resource.category !== ResourceCategory.RENEWABLE ||
      resource.naturalRecoveryRate === null ||
      resource.naturalRecoveryRate === undefined ||
      resource.naturalRecoveryRate <= 0
    ) {
      return {};
    }

    if (!ResourceCalculator.SUPPORTED_RENEWABLES.includes(resource.type)) {
      return {};
    }

    if (hoursElapsed <= 0) return {};

    let modifier = 1.0;

    // 2. Authoritative Environmental State Modifiers (Temperature, Humidity, Wind)
    if (envState) {
      // Biological growth (Forests, Grasslands, Wildlife) temperature sensitivities
      if (
        resource.type === ResourceType.FORESTS ||
        resource.type === ResourceType.GRASSLANDS ||
        resource.type === ResourceType.WILDLIFE
      ) {
        if (envState.temperature < 0 || envState.temperature > 40) {
          modifier *= 0.5; // Extreme cold or extreme heat slows biological growth
        } else if (envState.temperature >= 15 && envState.temperature <= 25) {
          modifier *= 1.2; // Optimal growth temperature window
        }
      }

      // Wildlife harsh climate stress
      if (resource.type === ResourceType.WILDLIFE) {
        if (envState.temperature < -10 || envState.temperature > 42) {
          modifier *= 0.6;
        }
      }

      // Fish aquatic temperature sensitivity (oxygen depletion in high heat)
      if (resource.type === ResourceType.FISH) {
        if (envState.temperature > 35) {
          modifier *= 0.6; // High heat distress
        } else if (envState.temperature >= 12 && envState.temperature <= 22) {
          modifier *= 1.2; // Optimal aquatic water temperature
        }
      }

      // Water regeneration: humidity, evaporation, freezing
      if (resource.type === ResourceType.WATER) {
        if (envState.humidity > 80) {
          modifier *= 1.2; // High humidity reduces surface evaporation
        } else if (envState.humidity < 25) {
          modifier *= 0.7; // Low humidity accelerates evaporation
        }

        if (envState.temperature > 40 && envState.humidity < 30) {
          modifier *= 0.4; // Severe drought evaporation
        } else if (envState.temperature > 35) {
          modifier *= 0.7; // High temperature evaporation
        } else if (envState.temperature > 30) {
          modifier *= 0.85;
        } else if (envState.temperature < -10) {
          modifier *= 0.2; // Severe freeze halts liquid recharge
        } else if (envState.temperature < 0) {
          modifier *= 0.6; // Moderate freeze slows liquid runoff
        }
      }

      // Wind potential scaling with authoritative wind speed
      if (resource.type === ResourceType.WIND_POTENTIAL && envState.windSpeed !== undefined) {
        const windFactor = Math.max(0.2, Math.min(2.0, envState.windSpeed / 15));
        modifier *= windFactor;
      }
    }

    // 3. Authoritative Weather Modifiers
    if (weather) {
      if (resource.type === ResourceType.WATER) {
        if (weather.currentType === 'Rain') modifier *= 2.0;
        else if (weather.currentType === 'Light Rain') modifier *= 1.3;
        else if (weather.currentType === 'Storm') modifier *= 2.5;
        else if (weather.currentType === 'Heavy Snow') modifier *= 1.8;
        else if (weather.currentType === 'Light Snow') modifier *= 1.2;
        else if (weather.currentType === 'Sunny' && envState && envState.temperature > 30) {
          modifier *= 0.8; // Sunny & hot accelerates evaporation
        }
      }

      if (resource.type === ResourceType.FORESTS || resource.type === ResourceType.GRASSLANDS) {
        if (weather.currentType === 'Rain' || weather.currentType === 'Light Rain') modifier *= 1.5;
        else if (weather.currentType === 'Storm') modifier *= 0.8; // Canopy damage / soil erosion
      }

      if (resource.type === ResourceType.FISH) {
        if (weather.currentType === 'Storm') modifier *= 0.8; // Rough weather distress
      }

      if (resource.type === ResourceType.WIND_POTENTIAL) {
        if (weather.currentType === 'Storm') modifier *= 1.8;
        else if (weather.currentType === 'Heavy Snow') modifier *= 1.3;
      }

      if (resource.type === ResourceType.SOLAR_POTENTIAL) {
        if (weather.currentType === 'Sunny') modifier *= 1.0;
        else if (weather.currentType === 'Cloudy' || weather.currentType === 'Fog') modifier *= 0.6;
        else if (weather.currentType === 'Rain' || weather.currentType === 'Light Rain') modifier *= 0.3;
        else if (weather.currentType === 'Heavy Snow' || weather.currentType === 'Light Snow') modifier *= 0.2;
        else if (weather.currentType === 'Storm') modifier *= 0.1;
      }
    }

    // 4. Seasonal Modifiers
    if (
      resource.type === ResourceType.FORESTS ||
      resource.type === ResourceType.GRASSLANDS ||
      resource.type === ResourceType.WILDLIFE
    ) {
      if (season === 'Spring') modifier *= 1.5;
      else if (season === 'Summer') modifier *= 1.1;
      else if (season === 'Autumn') modifier *= 0.8;
      else if (season === 'Winter') modifier *= 0.3; // Dormancy
    }

    if (resource.type === ResourceType.WATER) {
      if (season === 'Spring') modifier *= 1.3; // Spring melt / aquifer recharge
      else if (season === 'Summer') modifier *= 0.85; // Summer dry period
      else if (season === 'Winter') modifier *= 0.7; // Cold / snow accumulation
      // Autumn is baseline 1.0
    }

    if (resource.type === ResourceType.FISH) {
      if (season === 'Spring') modifier *= 1.4; // Spring spawning
      else if (season === 'Winter') modifier *= 0.5; // Winter dormancy
    }

    // 5. Day Phase Modifiers (Potentials)
    if (resource.type === ResourceType.SOLAR_POTENTIAL) {
      if (dayPhase === 'Night') modifier = 0;
      else if (dayPhase === 'Dawn' || dayPhase === 'Evening') modifier *= 0.3;
      else if (dayPhase === 'Afternoon') modifier *= 1.0;
      else modifier *= 0.6; // Morning
    }

    // 6. Quantity Calculations and Conservation Bounds
    const updates: Partial<Resource> = {};

    if (resource.type === ResourceType.SOLAR_POTENTIAL || resource.type === ResourceType.WIND_POTENTIAL) {
      // Instantaneous potentials represent available ambient power capacity
      let currentPotential = resource.maximumAmount * modifier;
      if (currentPotential > resource.maximumAmount) currentPotential = resource.maximumAmount;
      if (currentPotential < 0) currentPotential = 0;
      updates.currentAmount = Number(currentPotential.toFixed(2));
    } else {
      // Cumulative renewable resources (Water, Forests, Grasslands, Wildlife, Fish)
      const baseRegen = resource.naturalRecoveryRate ?? 0;
      const generatedAmount = baseRegen * modifier * hoursElapsed;
      const consumption = resource.consumptionRate ?? 0;
      let newQuantity = resource.currentAmount + generatedAmount - (consumption * hoursElapsed);

      // Clamp strictly within [0, maximumAmount]
      if (newQuantity > resource.maximumAmount) newQuantity = resource.maximumAmount;
      if (newQuantity < 0) newQuantity = 0;

      updates.currentAmount = Number(newQuantity.toFixed(2));
    }

    // 7. Biological and Quality Condition Changes
    if (
      resource.condition !== null &&
      (resource.type === ResourceType.FORESTS ||
        resource.type === ResourceType.WILDLIFE ||
        resource.type === ResourceType.FISH ||
        resource.type === ResourceType.WATER)
    ) {
      let newHealth = resource.condition.value;
      if (envState && envState.temperature > 40 && envState.humidity < 20) {
        newHealth -= 0.01 * hoursElapsed; // Extreme heat/drought stress
      } else if (modifier >= 1.2) {
        newHealth += 0.005 * hoursElapsed; // Favorable condition recovery
      }

      if (newHealth > 1.0) newHealth = 1.0;
      if (newHealth < 0) newHealth = 0;

      updates.condition = {
        type: resource.condition.type,
        value: Number(newHealth.toFixed(4))
      };
    }

    return updates;
  }
}
