import { AgriculturalYieldCalculator } from '../AgriculturalYieldCalculator';
import { CropDefinition } from '@genesis/shared';

describe('AgriculturalYieldCalculator', () => {
  const wheatCrop: CropDefinition = {
    productId: 'wheat',
    cropType: 'WHEAT',
    unit: 'kg',
    baseYieldPerArea: 100,
    workersRequiredPerUnitArea: 1,
    suitableSeasons: ['Spring', 'Summer', 'Autumn'],
    temperatureRange: {
      minViable: 0,
      optimalMin: 15,
      optimalMax: 25,
      maxViable: 35
    },
    growingPeriod: 1,
    suitableSoil: ['PLAIN', 'GRASSLANDS'],
    unsuitableSeasonMultiplier: 0.0,
    adverseWeatherModifiers: {
      'Storm': 0.5,
      'Heavy Snow': 0.0,
      'Light Snow': 0.4,
      'Rain': 1.0,
      'Sunny': 1.05
    }
  };

  test('1. Compatible vs Unsuitable Growing Seasons', () => {
    // Spring (compatible)
    const springResult = AgriculturalYieldCalculator.calculateYield(
      wheatCrop,
      { season: 'Spring', temperature: 20, weather: 'Sunny', soilType: 'PLAIN' },
      { baseCapacity: 1000, workerEfficiency: 1.0 }
    );
    expect(springResult.seasonFactor).toBe(1.0);
    expect(springResult.isUnsuitableSeason).toBe(false);
    expect(springResult.finalYield).toBeGreaterThan(0);

    // Winter (unsuitable, multiplier 0)
    const winterResult = AgriculturalYieldCalculator.calculateYield(
      wheatCrop,
      { season: 'Winter', temperature: 5, weather: 'Cloudy', soilType: 'PLAIN' },
      { baseCapacity: 1000, workerEfficiency: 1.0 }
    );
    expect(winterResult.seasonFactor).toBe(0.0);
    expect(winterResult.isUnsuitableSeason).toBe(true);
    expect(winterResult.status).toBe('DORMANT_UNSUITABLE');
    expect(winterResult.finalYield).toBe(0);
  });

  test('2. Favorable vs Adverse Temperature Conditions', () => {
    // Optimal: 20°C
    const optimal = AgriculturalYieldCalculator.calculateYield(
      wheatCrop,
      { season: 'Summer', temperature: 20, weather: 'Sunny', soilType: 'PLAIN' },
      { baseCapacity: 1000, workerEfficiency: 1.0 }
    );
    expect(optimal.temperatureFactor).toBe(1.0);

    // Sub-optimal cold: 7.5°C (midpoint between 0 and 15)
    const cold = AgriculturalYieldCalculator.calculateYield(
      wheatCrop,
      { season: 'Spring', temperature: 7.5, weather: 'Sunny', soilType: 'PLAIN' },
      { baseCapacity: 1000, workerEfficiency: 1.0 }
    );
    expect(cold.temperatureFactor).toBeCloseTo(0.5, 2);

    // Sub-zero frost (< 0°C minViable)
    const frost = AgriculturalYieldCalculator.calculateYield(
      wheatCrop,
      { season: 'Spring', temperature: -2, weather: 'Sunny', soilType: 'PLAIN' },
      { baseCapacity: 1000, workerEfficiency: 1.0 }
    );
    expect(frost.temperatureFactor).toBe(0.0);
    expect(frost.finalYield).toBe(0);
    expect(frost.status).toBe('SEVERE_ADVERSE');

    // Extreme heat (> 35°C maxViable)
    const heatwave = AgriculturalYieldCalculator.calculateYield(
      wheatCrop,
      { season: 'Summer', temperature: 40, weather: 'Sunny', soilType: 'PLAIN' },
      { baseCapacity: 1000, workerEfficiency: 1.0 }
    );
    expect(heatwave.temperatureFactor).toBe(0.0);
    expect(heatwave.finalYield).toBe(0);
    expect(heatwave.status).toBe('SEVERE_ADVERSE');
  });

  test('3. Neutral fallback when environmental observation is unavailable', () => {
    const fallback = AgriculturalYieldCalculator.calculateYield(
      wheatCrop,
      { season: 'Spring', temperature: null, weather: null, soilType: null },
      { baseCapacity: 1000, workerEfficiency: 1.0 }
    );
    expect(fallback.temperatureFactor).toBe(1.0);
    expect(fallback.weatherFactor).toBe(1.0);
    expect(fallback.soilFactor).toBe(1.0);
    expect(fallback.soilMeasurementAvailable).toBe(false);
    expect(fallback.finalYield).toBe(1000);
  });

  test('4. Adverse Weather Conditions (Storm & Heavy Snow)', () => {
    // Storm reduces wheat yield by 50%
    const storm = AgriculturalYieldCalculator.calculateYield(
      wheatCrop,
      { season: 'Summer', temperature: 22, weather: 'Storm', soilType: 'PLAIN' },
      { baseCapacity: 1000, workerEfficiency: 1.0 }
    );
    expect(storm.weatherFactor).toBe(0.5);
    expect(storm.finalYield).toBe(500);

    // Heavy Snow halts harvest
    const blizzard = AgriculturalYieldCalculator.calculateYield(
      wheatCrop,
      { season: 'Spring', temperature: 1, weather: 'Heavy Snow', soilType: 'PLAIN' },
      { baseCapacity: 1000, workerEfficiency: 1.0 }
    );
    expect(blizzard.weatherFactor).toBe(0.0);
    expect(blizzard.finalYield).toBe(0);
  });

  test('5. Soil Suitability and Marginal Terrains', () => {
    // Suitable plain: 1.0
    const plain = AgriculturalYieldCalculator.calculateYield(
      wheatCrop,
      { season: 'Spring', temperature: 20, weather: 'Sunny', soilType: 'PLAIN' },
      { baseCapacity: 1000, workerEfficiency: 1.0 }
    );
    expect(plain.soilFactor).toBe(1.0);

    // Marginal hill: 0.8
    const hill = AgriculturalYieldCalculator.calculateYield(
      wheatCrop,
      { season: 'Spring', temperature: 20, weather: 'Sunny', soilType: 'HILL' },
      { baseCapacity: 1000, workerEfficiency: 1.0 }
    );
    expect(hill.soilFactor).toBe(0.8);

    // Desert terrain: 0.2
    const desert = AgriculturalYieldCalculator.calculateYield(
      wheatCrop,
      { season: 'Spring', temperature: 20, weather: 'Sunny', soilType: 'DESERT' },
      { baseCapacity: 1000, workerEfficiency: 1.0 }
    );
    expect(desert.soilFactor).toBe(0.2);
  });

  test('6. Yield bounds and invalid input handling (NaN, negative, infinite)', () => {
    const invalid = AgriculturalYieldCalculator.calculateYield(
      wheatCrop,
      { season: 'Spring', temperature: NaN, weather: null, soilType: null },
      { baseCapacity: -500, workerEfficiency: Infinity }
    );
    expect(invalid.finalYield).toBe(0);
    expect(Number.isFinite(invalid.finalYield)).toBe(true);
    expect(invalid.finalYield).toBeGreaterThanOrEqual(0);
  });

  test('7. Capacity and worker efficiency applied exactly once', () => {
    // Base capacity 1000, worker efficiency 0.6 (60%)
    // Env multiplier = 1.05 (Sunny)
    const result = AgriculturalYieldCalculator.calculateYield(
      wheatCrop,
      { season: 'Spring', temperature: 20, weather: 'Sunny', soilType: 'PLAIN' },
      { baseCapacity: 1000, workerEfficiency: 0.6 }
    );
    expect(result.capacityYield).toBe(600);
    expect(result.overallEnvironmentalMultiplier).toBe(1.05);
    expect(result.finalYield).toBe(630); // 600 * 1.05
  });

  test('8. Water shortage constraint reduces yield proportionally', () => {
    const waterShortage = AgriculturalYieldCalculator.calculateYield(
      wheatCrop,
      { season: 'Summer', temperature: 22, weather: 'Sunny', soilType: 'PLAIN', waterAvailabilityRatio: 0.4 },
      { baseCapacity: 1000, workerEfficiency: 1.0 }
    );
    expect(waterShortage.waterAvailabilityFactor).toBe(0.4);
    expect(waterShortage.status).toBe('RESOURCE_CONSTRAINED');
    expect(waterShortage.finalYield).toBe(420); // 1000 * 1.05 * 0.4
  });
});
