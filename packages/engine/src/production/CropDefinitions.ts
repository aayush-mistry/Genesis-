import { CropDefinition, WorkplaceType } from '@genesis/shared';

export const WHEAT_CROP_DEFINITION: CropDefinition = {
  productId: 'wheat',
  cropType: 'WHEAT',
  workplaceType: WorkplaceType.FARM,
  unit: 'kg',
  baseYieldPerArea: 100,
  workersRequiredPerUnitArea: 1,
  growingPeriod: 1,
  suitableSeasons: ['Spring', 'Summer', 'Autumn'],
  temperatureRange: {
    minViable: 0,
    optimalMin: 15,
    optimalMax: 25,
    maxViable: 35
  },
  suitableSoil: ['PLAIN', 'GRASSLANDS'],
  unsuitableSeasonMultiplier: 0.0,
  adverseWeatherModifiers: {
    'Sunny': 1.05,
    'Cloudy': 1.0,
    'Light Rain': 1.10,
    'Rain': 1.0,
    'Fog': 0.95,
    'Light Snow': 0.40,
    'Storm': 0.50,
    'Heavy Snow': 0.0
  },
  resourceRequirements: [
    { resourceId: 'WATER', amountPerOutputUnit: 20 }
  ]
};

export const CORN_CROP_DEFINITION: CropDefinition = {
  productId: 'corn',
  cropType: 'CORN',
  workplaceType: WorkplaceType.FARM,
  unit: 'kg',
  baseYieldPerArea: 120,
  workersRequiredPerUnitArea: 1,
  growingPeriod: 1,
  suitableSeasons: ['Summer', 'Autumn'],
  temperatureRange: {
    minViable: 8,
    optimalMin: 20,
    optimalMax: 30,
    maxViable: 38
  },
  suitableSoil: ['PLAIN', 'GRASSLANDS'],
  unsuitableSeasonMultiplier: 0.0,
  adverseWeatherModifiers: {
    'Sunny': 1.10,
    'Light Rain': 1.15,
    'Rain': 1.05,
    'Storm': 0.45,
    'Light Snow': 0.10,
    'Heavy Snow': 0.0
  },
  resourceRequirements: [
    { resourceId: 'WATER', amountPerOutputUnit: 25 }
  ]
};

export const POTATO_CROP_DEFINITION: CropDefinition = {
  productId: 'potato',
  cropType: 'POTATO',
  workplaceType: WorkplaceType.FARM,
  unit: 'kg',
  baseYieldPerArea: 150,
  workersRequiredPerUnitArea: 1,
  growingPeriod: 1,
  suitableSeasons: ['Spring', 'Summer', 'Autumn'],
  temperatureRange: {
    minViable: 4,
    optimalMin: 14,
    optimalMax: 22,
    maxViable: 30
  },
  suitableSoil: ['PLAIN', 'HILL'],
  unsuitableSeasonMultiplier: 0.05,
  adverseWeatherModifiers: {
    'Sunny': 1.0,
    'Rain': 1.10,
    'Light Rain': 1.10,
    'Storm': 0.60,
    'Light Snow': 0.30,
    'Heavy Snow': 0.0
  },
  resourceRequirements: [
    { resourceId: 'WATER', amountPerOutputUnit: 15 }
  ]
};
