import { 
  CropDefinition, 
  CropYieldBreakdown, 
  CropYieldStatus, 
  SeasonType, 
  WeatherType 
} from '@genesis/shared';

export interface EnvironmentalContext {
  season: SeasonType;
  temperature?: number | null;
  weather?: WeatherType | null;
  soilType?: string | null;
  waterAvailabilityRatio?: number; // 0.0 to 1.0 (default 1.0)
}

export interface CapacityContext {
  baseCapacity: number;
  workerEfficiency: number;
}

export class AgriculturalYieldCalculator {

  /**
   * Deterministically calculates agricultural crop yield and returns an explanatory breakdown.
   */
  public static calculateYield(
    crop: CropDefinition,
    env: EnvironmentalContext,
    capacity: CapacityContext,
    options?: { workplaceId?: string; regionId?: string; timestamp?: number }
  ): CropYieldBreakdown {
    // 1. Sanitize and validate capacity inputs
    const baseCapacity = Math.max(0, Number.isFinite(capacity.baseCapacity) ? capacity.baseCapacity : 0);
    const rawEfficiency = Number.isFinite(capacity.workerEfficiency) ? capacity.workerEfficiency : 0;
    const workerEfficiency = Math.max(0, Math.min(1.0, rawEfficiency));
    const capacityYield = baseCapacity * workerEfficiency;

    // 2. Season Factor
    const season = env.season;
    let seasonFactor = 1.0;
    let isUnsuitableSeason = false;

    if (crop.suitableSeasons && crop.suitableSeasons.length > 0) {
      if (!crop.suitableSeasons.includes(season)) {
        isUnsuitableSeason = true;
        seasonFactor = Math.max(0, Math.min(1.0, crop.unsuitableSeasonMultiplier ?? 0.0));
      }
    }

    // 3. Temperature Factor
    let temperatureFactor = 1.0;
    const temperature = (env.temperature !== undefined && env.temperature !== null && Number.isFinite(env.temperature))
      ? env.temperature
      : null;

    if (temperature !== null && crop.temperatureRange) {
      const { minViable, optimalMin, optimalMax, maxViable } = crop.temperatureRange;
      
      if (temperature <= minViable) {
        temperatureFactor = 0.0;
      } else if (temperature < optimalMin) {
        // Interpolate between minViable (0.0) and optimalMin (1.0)
        const range = optimalMin - minViable;
        temperatureFactor = range > 0 ? (temperature - minViable) / range : 0.0;
      } else if (temperature <= optimalMax) {
        temperatureFactor = 1.0; // Optimal range
      } else if (temperature < maxViable) {
        // Interpolate between optimalMax (1.0) and maxViable (0.0)
        const range = maxViable - optimalMax;
        temperatureFactor = range > 0 ? (maxViable - temperature) / range : 0.0;
      } else {
        temperatureFactor = 0.0; // Exceeds max viable (extreme heat)
      }

      temperatureFactor = Math.max(0.0, Math.min(1.0, temperatureFactor));
    }

    // 4. Weather Factor
    let weatherFactor = 1.0;
    const weather = env.weather ?? null;

    if (weather) {
      if (crop.adverseWeatherModifiers && crop.adverseWeatherModifiers[weather] !== undefined) {
        weatherFactor = crop.adverseWeatherModifiers[weather]!;
      } else {
        // Standard default weather response
        switch (weather) {
          case 'Sunny':
            weatherFactor = 1.05;
            break;
          case 'Cloudy':
            weatherFactor = 1.0;
            break;
          case 'Light Rain':
            weatherFactor = 1.10;
            break;
          case 'Rain':
            weatherFactor = 1.0;
            break;
          case 'Fog':
            weatherFactor = 0.95;
            break;
          case 'Light Snow':
            weatherFactor = 0.40;
            break;
          case 'Storm':
            weatherFactor = 0.50; // Severe wind / lodging
            break;
          case 'Heavy Snow':
            weatherFactor = 0.0; // Freezing ground cover
            break;
          default:
            weatherFactor = 1.0;
        }
      }
      weatherFactor = Math.max(0.0, Math.min(1.5, Number.isFinite(weatherFactor) ? weatherFactor : 1.0));
    }

    // 5. Soil Suitability Factor
    let soilFactor = 1.0;
    let soilMeasurementAvailable = false;
    const soilType = env.soilType ?? null;

    if (soilType) {
      soilMeasurementAvailable = true;
      if (crop.suitableSoil && crop.suitableSoil.length > 0) {
        const normalizedSoil = soilType.toUpperCase();
        const matchesSuitable = crop.suitableSoil.some(s => s.toUpperCase() === normalizedSoil);
        
        if (matchesSuitable) {
          soilFactor = 1.0;
        } else if (normalizedSoil.includes('HILL')) {
          soilFactor = 0.8; // Marginal soil on hills
        } else if (normalizedSoil.includes('DESERT') || normalizedSoil.includes('MOUNTAIN') || normalizedSoil.includes('ROCK')) {
          soilFactor = 0.2; // Unsuitable terrain
        } else {
          soilFactor = 0.6; // Sub-optimal soil
        }
      }
    } else {
      // Documented neutral fallback when soil measurement is unavailable
      soilMeasurementAvailable = false;
      soilFactor = 1.0;
    }
    soilFactor = Math.max(0.0, Math.min(1.5, soilFactor));

    // 6. Water Availability Factor
    const rawWaterRatio = Number.isFinite(env.waterAvailabilityRatio) ? env.waterAvailabilityRatio! : 1.0;
    const waterAvailabilityFactor = Math.max(0.0, Math.min(1.0, rawWaterRatio));

    // 7. Combined Environmental Multiplier
    const overallEnvironmentalMultiplier = Math.max(
      0.0, 
      Math.min(2.0, seasonFactor * temperatureFactor * weatherFactor * soilFactor)
    );

    // 8. Final Yield Calculation
    // Respect capacity & worker efficiency exactly once
    const finalYield = Number(
      (capacityYield * overallEnvironmentalMultiplier * waterAvailabilityFactor).toFixed(2)
    );

    // 9. Determine Status and Concise Explanation
    let status: CropYieldStatus = 'OPTIMAL';
    let isSevereCondition = false;
    const explanations: string[] = [];

    if (seasonFactor === 0.0) {
      status = 'DORMANT_UNSUITABLE';
      isSevereCondition = true;
      explanations.push(`Unsuitable season: ${crop.cropType || crop.productId} is dormant in ${season}`);
    } else if (temperatureFactor === 0.0) {
      status = 'SEVERE_ADVERSE';
      isSevereCondition = true;
      explanations.push(`Thermal failure: ${temperature}°C is outside viable range [${crop.temperatureRange.minViable}°C to ${crop.temperatureRange.maxViable}°C]`);
    } else if (weatherFactor === 0.0) {
      status = 'SEVERE_ADVERSE';
      isSevereCondition = true;
      explanations.push(`Severe adverse weather: ${weather} destroyed potential harvest`);
    } else if (waterAvailabilityFactor < 0.5) {
      status = 'RESOURCE_CONSTRAINED';
      explanations.push(`Severe water shortage: Available water is ${(waterAvailabilityFactor * 100).toFixed(0)}% of required irrigation`);
    } else if (overallEnvironmentalMultiplier < 0.8 || waterAvailabilityFactor < 1.0) {
      status = 'REDUCED_YIELD';
      if (seasonFactor < 1.0) explanations.push(`Sub-optimal season (${season})`);
      if (temperatureFactor < 1.0) explanations.push(`Non-ideal temperature (${temperature}°C)`);
      if (weatherFactor < 1.0) explanations.push(`Adverse weather (${weather})`);
      if (soilFactor < 1.0) explanations.push(`Sub-optimal soil (${soilType})`);
      if (waterAvailabilityFactor < 1.0) explanations.push(`Partial water deficit (${(waterAvailabilityFactor * 100).toFixed(0)}%)`);
    } else if (overallEnvironmentalMultiplier > 1.05) {
      status = 'FAVORABLE';
      explanations.push(`Favorable growing conditions in ${season} with ${weather || 'clear weather'}`);
    } else {
      status = 'OPTIMAL';
      explanations.push(`Normal growing conditions in ${season}`);
    }

    const explanation = explanations.join('; ') || 'Standard agricultural yield';

    return {
      workplaceId: options?.workplaceId,
      cropId: crop.productId,
      cropType: crop.cropType || crop.productId,
      regionId: options?.regionId || 'unknown',
      season,
      seasonFactor: Number(seasonFactor.toFixed(3)),
      temperature,
      temperatureFactor: Number(temperatureFactor.toFixed(3)),
      weather,
      weatherFactor: Number(weatherFactor.toFixed(3)),
      soilType,
      soilFactor: Number(soilFactor.toFixed(3)),
      soilMeasurementAvailable,
      waterAvailabilityFactor: Number(waterAvailabilityFactor.toFixed(3)),
      overallEnvironmentalMultiplier: Number(overallEnvironmentalMultiplier.toFixed(3)),
      baseCapacityYield: Number(baseCapacity.toFixed(2)),
      workerEfficiency: Number(workerEfficiency.toFixed(3)),
      capacityYield: Number(capacityYield.toFixed(2)),
      finalYield: Math.max(0, finalYield),
      isUnsuitableSeason,
      isSevereCondition,
      status,
      explanation,
      timestamp: options?.timestamp || 0
    };
  }
}
