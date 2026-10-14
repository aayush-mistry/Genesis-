import { WorkplaceType } from './occupation';
import { SeasonType, WeatherType } from './environment';

export interface ProductionDefinition {
  workplaceType?: WorkplaceType;
  productId: string;
  unit: string;
  baseYieldPerArea: number; // e.g. per 1000m² or per workplace capacity
  workersRequiredPerUnitArea: number;
  resourceRequirements?: { resourceId: string; amountPerOutputUnit: number; }[];
  climateRequirements?: string[];
  seasonalModifier?: Record<string, number>; // Maps season name to a multiplier (e.g. { Winter: 0.5 })
}

export interface TemperatureRange {
  minViable: number;    // Below this, crop freezes/fails (yield reaches 0)
  optimalMin: number;   // Lower bound of ideal growing temperature
  optimalMax: number;   // Upper bound of ideal growing temperature
  maxViable: number;    // Above this, heat stress kills/halts crop (yield reaches 0)
}

export interface CropDefinition extends ProductionDefinition {
  cropType: string;
  suitableSeasons: SeasonType[];
  temperatureRange: TemperatureRange;
  growingPeriod: number; // Duration of production cycle in days
  suitableSoil?: string[]; // e.g. ['PLAIN', 'GRASSLANDS', 'LOAM', 'HILL']
  waterRequirementPerUnit?: number; // Litres of water per unit output (e.g. 20 L / kg wheat)
  adverseWeatherModifiers?: Partial<Record<WeatherType, number>>; // Multiplier under specific weather
  unsuitableSeasonMultiplier?: number; // Multiplier when grown out of season (default: 0.0)
}

export type CropYieldStatus = 
  | 'OPTIMAL'
  | 'FAVORABLE'
  | 'REDUCED_YIELD'
  | 'DORMANT_UNSUITABLE'
  | 'RESOURCE_CONSTRAINED'
  | 'SEVERE_ADVERSE';

export interface CropYieldBreakdown {
  workplaceId?: string;
  cropId: string;
  cropType: string;
  regionId: string;
  season: SeasonType;
  seasonFactor: number;
  temperature: number | null;
  temperatureFactor: number;
  weather: WeatherType | null;
  weatherFactor: number;
  soilType: string | null;
  soilFactor: number;
  soilMeasurementAvailable: boolean;
  waterAvailabilityFactor: number;
  overallEnvironmentalMultiplier: number;
  baseCapacityYield: number;
  workerEfficiency: number;
  capacityYield: number;
  finalYield: number;
  isUnsuitableSeason: boolean;
  isSevereCondition: boolean;
  status: CropYieldStatus;
  explanation: string;
  timestamp: number;
}

