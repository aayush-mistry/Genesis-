export interface Currency {
  code: string;
  symbol: string;
  name: string;
}

export enum ProductCategory {
  FOOD = 'FOOD',
  CLOTHING = 'CLOTHING',
  GROCERIES = 'GROCERIES',
  FUEL = 'FUEL',
  SHELTER = 'SHELTER',
  ENTERTAINMENT = 'ENTERTAINMENT',
  RAW_MATERIAL = 'RAW_MATERIAL'
}

export interface Commodity {
  id: string;
  name: string;
  category: ProductCategory;
  unit: string;
  basePrice: number;
  isBiological: boolean;
  storageRequirements?: Record<string, unknown>;
  consumable?: {
    restorationNeed: 'HUNGER' | 'THIRST';
    restorationValue: number;
  };
  perishable?: {
    shelfLifeHours: number;
  };
  metadata?: Record<string, unknown>;
}
