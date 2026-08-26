import { BaseEntity } from './common';

export enum ResourceCategory {
  RENEWABLE = 'RENEWABLE',
  NON_RENEWABLE = 'NON_RENEWABLE',
  OPERATIONAL = 'OPERATIONAL',
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
  FUEL = 'FUEL',
  ELECTRICITY = 'ELECTRICITY',
  FERTILIZER = 'FERTILIZER',
  SEEDS = 'SEEDS',
  MACHINERY = 'MACHINERY',
}

export interface ResourceCondition {
  type: string;
  value: number; // 0 to 1
}

export interface Resource extends BaseEntity {
  type: ResourceType;
  name: string;
  category: ResourceCategory;
  unit: string;
  renewable: boolean;
  regionId: string;
  currentAmount: number;
  maximumAmount: number;
  naturalRecoveryRate: number | null; // Amount generated per tick (null for non-renewable)
  consumptionRate: number | null; // Current consumption (null if not simulated)
  condition: ResourceCondition | null;
  extractionDifficulty: number; // 0 (easy) to 1 (hard)
  tradable?: boolean;
  borrowable?: boolean;
  exportable?: boolean;
  reservedAmount?: number;
  metadata?: Record<string, unknown>;
}

export interface ResourceStatistics {
  totalQuantity: number;
  averageCondition: number;
  renewableQuantity: number;
  nonRenewableQuantity: number;
  resourceDistribution: Record<string, number>;
  averageRegenerationRate: number;
}
