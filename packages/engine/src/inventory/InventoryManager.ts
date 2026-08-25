import { Inventory, InventoryItem, InventoryBatch, InventoryBatchStatus } from '@genesis/shared';

export class InventoryManager {
  private inventories: Map<string, Inventory> = new Map();

  public createInventory(id: string, ownerId: string, storageCapacity: number): Inventory {
    if (this.inventories.has(id)) {
      throw new Error(`Inventory with ID ${id} already exists.`);
    }

    const inventory: Inventory = {
      id,
      ownerId,
      storageCapacity,
      items: {}
    };

    this.inventories.set(id, inventory);
    return inventory;
  }

  public getInventory(id: string): Inventory | undefined {
    return this.inventories.get(id);
  }

  public getInventoryByOwner(ownerId: string): Inventory | undefined {
    for (const inventory of this.inventories.values()) {
      if (inventory.ownerId === ownerId) {
        return inventory;
      }
    }
    return undefined;
  }

  public getAllInventories(): Inventory[] {
    return Array.from(this.inventories.values());
  }

  public addItemQuantity(
    inventoryId: string, 
    productId: string, 
    quantity: number, 
    unit: string, 
    acquiredAt: number = 0, 
    expiryAt?: number
  ): boolean {
    const inventory = this.inventories.get(inventoryId);
    if (!inventory) return false;

    // Calculate current total storage used
    let currentTotal = 0;
    for (const item of Object.values(inventory.items)) {
      currentTotal += item.totalQuantity;
    }

    if (currentTotal + quantity > inventory.storageCapacity) {
      // Cannot store everything, rejecting the addition.
      return false;
    }

    if (!inventory.items[productId]) {
      inventory.items[productId] = {
        productId,
        totalQuantity: 0,
        reservedQuantity: 0,
        availableQuantity: 0,
        unit,
        batches: []
      };
    }

    const item = inventory.items[productId];
    
    // Add batch
    if (!item.batches) {
      item.batches = [];
    }
    
    item.batches.push({
      quantity,
      acquiredAt,
      expiryAt,
      status: 'FRESH' as InventoryBatchStatus
    });

    item.totalQuantity += quantity;
    this.updateAvailable(item);

    return true;
  }

  public removeItemQuantity(inventoryId: string, productId: string, quantity: number): boolean {
    const inventory = this.inventories.get(inventoryId);
    if (!inventory) return false;

    const item = inventory.items[productId];
    if (!item) return false;

    if (item.availableQuantity < quantity) {
      return false; // Not enough available to remove
    }

    // Remove from batches FIFO
    let remainingToRemove = quantity;
    if (item.batches) {
      // Sort batches by acquiredAt (FIFO)
      item.batches.sort((a, b) => a.acquiredAt - b.acquiredAt);
      
      for (let i = 0; i < item.batches.length && remainingToRemove > 0; i++) {
        const batch = item.batches[i];
        if (batch.quantity <= remainingToRemove) {
          remainingToRemove -= batch.quantity;
          batch.quantity = 0;
        } else {
          batch.quantity -= remainingToRemove;
          remainingToRemove = 0;
        }
      }
      
      // Cleanup empty batches
      item.batches = item.batches.filter(b => b.quantity > 0);
    }

    item.totalQuantity -= quantity;
    this.updateAvailable(item);

    if (item.totalQuantity <= 0) {
      delete inventory.items[productId];
    }

    return true;
  }

  public reserveItemQuantity(inventoryId: string, productId: string, quantity: number): boolean {
    const inventory = this.inventories.get(inventoryId);
    if (!inventory) return false;

    const item = inventory.items[productId];
    if (!item) return false;

    if (item.availableQuantity < quantity) {
      return false; // Not enough available to reserve
    }

    item.reservedQuantity += quantity;
    this.updateAvailable(item);
    return true;
  }

  public consumeReservedItem(inventoryId: string, productId: string, quantity: number): boolean {
     const inventory = this.inventories.get(inventoryId);
     if (!inventory) return false;
 
     const item = inventory.items[productId];
     if (!item) return false;
 
     if (item.reservedQuantity < quantity) {
       return false; // Cannot consume more than reserved
     }
 
     item.reservedQuantity -= quantity;
     
     // Note: for batch logic, if this is called, we assume removeItemQuantity logic applies to the total
     // We will remove from batches FIFO.
     let remainingToRemove = quantity;
     if (item.batches) {
       item.batches.sort((a, b) => a.acquiredAt - b.acquiredAt);
       for (let i = 0; i < item.batches.length && remainingToRemove > 0; i++) {
         const batch = item.batches[i];
         if (batch.quantity <= remainingToRemove) {
           remainingToRemove -= batch.quantity;
           batch.quantity = 0;
         } else {
           batch.quantity -= remainingToRemove;
           remainingToRemove = 0;
         }
       }
       item.batches = item.batches.filter(b => b.quantity > 0);
     }
     
     item.totalQuantity -= quantity;
     this.updateAvailable(item);
 
     if (item.totalQuantity <= 0) {
       delete inventory.items[productId];
     }
 
     return true;
  }

  public releaseReservedItem(inventoryId: string, productId: string, quantity: number): boolean {
     const inventory = this.inventories.get(inventoryId);
     if (!inventory) return false;
 
     const item = inventory.items[productId];
     if (!item) return false;
 
     if (item.reservedQuantity < quantity) {
       return false;
     }
 
     item.reservedQuantity -= quantity;
     this.updateAvailable(item);
     return true;
  }
  
  public removeExpiredItems(currentTime: number): void {
    for (const inventory of this.inventories.values()) {
      for (const productId of Object.keys(inventory.items)) {
        const item = inventory.items[productId];
        if (!item.batches) continue;
        
        let expiredQuantity = 0;
        
        item.batches = item.batches.filter(batch => {
          if (batch.expiryAt !== undefined && currentTime >= batch.expiryAt) {
            batch.status = 'EXPIRED' as InventoryBatchStatus;
            expiredQuantity += batch.quantity;
            return false; // Remove expired batch
          }
          return true;
        });
        
        if (expiredQuantity > 0) {
          // If expired goods were reserved, this might cause an issue. We assume expired goods were not reserved 
          // or we just deduct from total.
          item.totalQuantity = Math.max(0, item.totalQuantity - expiredQuantity);
          
          // Adjust reserved if necessary
          if (item.reservedQuantity > item.totalQuantity) {
            item.reservedQuantity = item.totalQuantity;
          }
          
          this.updateAvailable(item);
          
          if (item.totalQuantity <= 0) {
            delete inventory.items[productId];
          }
        }
      }
    }
  }

  public getUsableQuantity(inventoryId: string, productId: string, currentTime: number): number {
    const inventory = this.inventories.get(inventoryId);
    if (!inventory) return 0;
    
    const item = inventory.items[productId];
    if (!item) return 0;
    
    if (!item.batches) return item.availableQuantity;
    
    let usable = 0;
    for (const batch of item.batches) {
      if (batch.status !== 'EXPIRED' && (batch.expiryAt === undefined || batch.expiryAt > currentTime)) {
        usable += batch.quantity;
      }
    }
    
    // Cap at available quantity in case some are reserved
    return Math.min(usable, item.availableQuantity);
  }

  private updateAvailable(item: InventoryItem): void {
    item.availableQuantity = item.totalQuantity - item.reservedQuantity;
  }
}
