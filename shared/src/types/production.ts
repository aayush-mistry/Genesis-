import { WorkplaceType } from './occupation';

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

export interface CropDefinition extends ProductionDefinition {
  cropType: string;
  suitableSoil: string[];
  growingPeriod: number; // hours or days
}
