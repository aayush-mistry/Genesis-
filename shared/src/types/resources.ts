import { BaseEntity } from './common';

export enum ResourceCategory {
  RENEWABLE = 'RENEWABLE',
  NON_RENEWABLE = 'NON_RENEWABLE',
}

export enum ResourceType {
  WATER = 'WATER',
  FORESTS = 'FORESTS',
  GRASSLANDS = 'GRASSLANDS',
  WILDLIFE = 'WILDLIFE',
  FISH = 'FISH',
  STONE = 'STONE',
  IRON = 'IRON',
  COPPER = 'COPPER',
  COAL = 'COAL',
  GOLD = 'GOLD',
  OIL = 'OIL',
  NATURAL_GAS = 'NATURAL_GAS',
  SOLAR_POTENTIAL = 'SOLAR_POTENTIAL',
  WIND_POTENTIAL = 'WIND_POTENTIAL',
  HYDROELECTRIC_POTENTIAL = 'HYDROELECTRIC_POTENTIAL',
}

export interface Resource extends BaseEntity {
  type: ResourceType;
  category: ResourceCategory;
  regionId: string;
  currentQuantity: number;
  maximumCapacity: number;
  quality: number; // 0 to 1
  purity?: number; // 0 to 1, mostly for minerals
  health?: number; // 0 to 1, mostly for biological
  regenerationRate: number; // Amount generated per tick (0 for non-renewable)
  consumptionRate: number; // Current consumption
  extractionDifficulty: number; // 0 (easy) to 1 (hard)
  metadata?: Record<string, unknown>;
}

export interface ResourceStatistics {
  totalQuantity: number;
  averageQuality: number;
  renewableQuantity: number;
  nonRenewableQuantity: number;
  resourceDistribution: Record<string, number>;
  averageRegenerationRate: number;
}
