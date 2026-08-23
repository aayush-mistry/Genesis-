export interface InventoryItem {
  productId: string;
  totalQuantity: number;
  reservedQuantity: number;
  availableQuantity: number;
  unit: string;
}

export interface Inventory {
  id: string;
  ownerId: string;
  storageCapacity: number;
  items: Record<string, InventoryItem>; // mapped by productId
}
