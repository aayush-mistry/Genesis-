export type InventoryBatchStatus = 'FRESH' | 'NEAR_EXPIRY' | 'EXPIRED';

export interface InventoryBatch {
  id?: string;
  quantity: number;
  acquiredAt: number;
  expiryAt?: number;
  status: InventoryBatchStatus;
  unitCost?: number;
}

export interface SpoilageRecord {
  id: string; // Deterministic unique ID e.g. SPOIL-{inventoryId}-{productId}-{batchAcquiredAt}-{batchExpiryAt}
  inventoryId: string;
  ownerId: string;
  productId: string;
  quantity: number;
  unit: string;
  batchAcquiredAt: number;
  batchExpiryAt: number;
  batchId?: string;
  timestamp: number; // Simulation time in seconds
  simulationCycle?: string;
  unitPrice: number | null; // null if valuation unavailable
  totalLoss: number | null; // null if valuation unavailable
  valuationUnavailable: boolean;
  valuationMethod?: 'BATCH_COST' | 'HISTORICAL_TRANSACTION' | 'COMMODITY_BASE' | 'UNAVAILABLE';
  regionId?: string;
  createdAt?: Date;
}

export interface InventoryItem {
  productId: string;
  totalQuantity: number;
  reservedQuantity: number;
  availableQuantity: number;
  unit: string;
  quality?: number;
  batches?: InventoryBatch[];
}

export interface Inventory {
  id: string;
  ownerId: string;
  storageCapacity: number;
  items: Record<string, InventoryItem>; // mapped by productId
}

