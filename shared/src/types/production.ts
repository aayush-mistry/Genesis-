export interface ProductionDefinition {
  productId: string;
  unit: string;
  baseYieldPerArea: number; // e.g. per 1000m² or per workplace capacity
  workersRequiredPerUnitArea: number;
  waterRequirement?: number; // amount of water needed per unit area
  climateRequirements?: string[];
  seasonalModifier?: Record<string, number>; // Maps season name to a multiplier (e.g. { Winter: 0.5 })
}

export interface CropDefinition extends ProductionDefinition {
  cropType: string;
  suitableSoil: string[];
  growingPeriod: number; // hours or days
}
