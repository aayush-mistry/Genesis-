export type InventoryBatchStatus = 'FRESH' | 'NEAR_EXPIRY' | 'EXPIRED';

export interface InventoryBatch {
  quantity: number;
  acquiredAt: number;
  expiryAt?: number;
  status: InventoryBatchStatus;
}

export interface InventoryItem {
  productId: string;
  totalQuantity: number;
  reservedQuantity: number;
  availableQuantity: number;
  unit: string;
  batches?: InventoryBatch[];
}

export interface Inventory {
  id: string;
  ownerId: string;
  storageCapacity: number;
  items: Record<string, InventoryItem>; // mapped by productId
}
