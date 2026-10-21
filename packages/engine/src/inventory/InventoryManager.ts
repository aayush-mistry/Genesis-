import { Inventory, InventoryItem, InventoryBatch, InventoryBatchStatus, SpoilageRecord } from '@genesis/shared';
import { SpoilageLedger } from './SpoilageLedger';

export type ValuationResolver = (productId: string, ownerId: string, quantity: number) => {
  unitPrice: number | null;
  totalLoss: number | null;
  valuationMethod: 'BATCH_COST' | 'HISTORICAL_TRANSACTION' | 'COMMODITY_BASE' | 'UNAVAILABLE';
} | null;

export class InventoryManager {
  private inventories: Map<string, Inventory> = new Map();
  private spoilageLedger?: SpoilageLedger;
  private valuationResolver?: ValuationResolver;

  public setSpoilageLedger(ledger: SpoilageLedger): void {
    this.spoilageLedger = ledger;
  }

  public getSpoilageLedger(): SpoilageLedger | undefined {
    return this.spoilageLedger;
  }

  public setValuationResolver(resolver: ValuationResolver): void {
    this.valuationResolver = resolver;
  }

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
    expiryAt?: number,
    unitCost?: number
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
      status: 'FRESH' as InventoryBatchStatus,
      unitCost
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

  public transferItemQuantity(sourceInventoryId: string, destInventoryId: string, productId: string, quantity: number, destUnit: string): boolean {
    const sourceInventory = this.inventories.get(sourceInventoryId);
    const destInventory = this.inventories.get(destInventoryId);
    if (!sourceInventory || !destInventory) return false;

    const sourceItem = sourceInventory.items[productId];
    if (!sourceItem || sourceItem.availableQuantity < quantity) return false;

    // Check dest capacity
    let currentTotal = 0;
    for (const item of Object.values(destInventory.items)) {
      currentTotal += item.totalQuantity;
    }
    if (currentTotal + quantity > destInventory.storageCapacity) {
      return false;
    }

    // Prepare destination item
    if (!destInventory.items[productId]) {
      destInventory.items[productId] = {
        productId,
        totalQuantity: 0,
        reservedQuantity: 0,
        availableQuantity: 0,
        unit: destUnit,
        batches: []
      };
    }
    const destItem = destInventory.items[productId];
    if (!destItem.batches) {
      destItem.batches = [];
    }

    // Transfer from source batches FIFO
    let remainingToRemove = quantity;
    if (sourceItem.batches) {
      sourceItem.batches.sort((a, b) => a.acquiredAt - b.acquiredAt);
      
      for (let i = 0; i < sourceItem.batches.length && remainingToRemove > 0; i++) {
        const batch = sourceItem.batches[i];
        
        let transferredQuantity = 0;
        if (batch.quantity <= remainingToRemove) {
          transferredQuantity = batch.quantity;
          remainingToRemove -= batch.quantity;
          batch.quantity = 0;
        } else {
          transferredQuantity = remainingToRemove;
          batch.quantity -= remainingToRemove;
          remainingToRemove = 0;
        }

        if (transferredQuantity > 0) {
          destItem.batches.push({
            quantity: transferredQuantity,
            acquiredAt: batch.acquiredAt,
            expiryAt: batch.expiryAt,
            status: batch.status,
            unitCost: batch.unitCost
          });
        }
      }
      
      sourceItem.batches = sourceItem.batches.filter(b => b.quantity > 0);
    } else {
      // Source had no batches (legacy or non-perishable maybe)
      destItem.batches.push({
        quantity,
        acquiredAt: 0,
        status: 'FRESH'
      });
    }

    sourceItem.totalQuantity -= quantity;
    this.updateAvailable(sourceItem);
    if (sourceItem.totalQuantity <= 0) {
      delete sourceInventory.items[productId];
    }

    destItem.totalQuantity += quantity;
    this.updateAvailable(destItem);

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
  
  public removeExpiredItems(currentTime: number): SpoilageRecord[] {
    const spoilageRecords: SpoilageRecord[] = [];

    for (const inventory of this.inventories.values()) {
      for (const productId of Object.keys(inventory.items)) {
        const item = inventory.items[productId];
        if (!item.batches || item.batches.length === 0) continue;
        
        let expiredQuantity = 0;
        const remainingBatches: InventoryBatch[] = [];

        for (const batch of item.batches) {
          if (batch.expiryAt !== undefined && currentTime >= batch.expiryAt) {
            batch.status = 'EXPIRED' as InventoryBatchStatus;
            const removedQty = batch.quantity;
            expiredQuantity += removedQty;

            const batchIdentifier = batch.id || `${batch.acquiredAt}-${batch.expiryAt}`;
            const recordId = `SPOIL-${inventory.id}-${productId}-${batchIdentifier}`;

            // Resolve valuation if available
            let unitPrice: number | null = batch.unitCost !== undefined && batch.unitCost !== null
              ? batch.unitCost
              : null;
            let totalLoss: number | null = unitPrice !== null ? unitPrice * removedQty : null;
            let valuationMethod: 'BATCH_COST' | 'HISTORICAL_TRANSACTION' | 'COMMODITY_BASE' | 'UNAVAILABLE' = 
              unitPrice !== null ? 'BATCH_COST' : 'UNAVAILABLE';
            let valuationUnavailable = unitPrice === null;

            if (valuationUnavailable && this.valuationResolver) {
              const resolved = this.valuationResolver(productId, inventory.ownerId, removedQty);
              if (resolved && resolved.unitPrice !== null && resolved.unitPrice !== undefined) {
                unitPrice = resolved.unitPrice;
                totalLoss = resolved.totalLoss ?? (unitPrice * removedQty);
                valuationMethod = resolved.valuationMethod;
                valuationUnavailable = false;
              }
            }

            const record: SpoilageRecord = {
              id: recordId,
              inventoryId: inventory.id,
              ownerId: inventory.ownerId,
              productId,
              quantity: removedQty,
              unit: item.unit,
              batchAcquiredAt: batch.acquiredAt,
              batchExpiryAt: batch.expiryAt,
              batchId: batch.id,
              timestamp: currentTime,
              unitPrice,
              totalLoss,
              valuationUnavailable,
              valuationMethod,
              createdAt: new Date()
            };

            if (this.spoilageLedger) {
              this.spoilageLedger.record(record);
            }

            spoilageRecords.push(record);
          } else {
            remainingBatches.push(batch);
          }
        }

        item.batches = remainingBatches;

        if (expiredQuantity > 0) {
          item.totalQuantity = Math.max(0, item.totalQuantity - expiredQuantity);
          
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

    return spoilageRecords;
  }

  public spoilBatchQuantity(
    inventoryId: string, 
    productId: string, 
    batchIndex: number, 
    quantity: number, 
    currentTime: number
  ): SpoilageRecord | null {
    const inventory = this.inventories.get(inventoryId);
    if (!inventory) return null;

    const item = inventory.items[productId];
    if (!item || !item.batches || batchIndex < 0 || batchIndex >= item.batches.length) return null;

    const batch = item.batches[batchIndex];
    if (quantity <= 0 || batch.quantity <= 0) return null;

    const removedQty = Math.min(quantity, batch.quantity);
    batch.quantity -= removedQty;

    const isFullBatch = batch.quantity <= 0;
    if (isFullBatch) {
      batch.status = 'EXPIRED';
      item.batches.splice(batchIndex, 1);
    }

    item.totalQuantity = Math.max(0, item.totalQuantity - removedQty);
    if (item.reservedQuantity > item.totalQuantity) {
      item.reservedQuantity = item.totalQuantity;
    }
    this.updateAvailable(item);

    if (item.totalQuantity <= 0) {
      delete inventory.items[productId];
    }

    const batchIdentifier = batch.id || `${batch.acquiredAt}-${batch.expiryAt ?? 'noexp'}`;
    const recordId = isFullBatch 
      ? `SPOIL-${inventory.id}-${productId}-${batchIdentifier}`
      : `SPOIL-${inventory.id}-${productId}-${batchIdentifier}-P${currentTime}`;

    let unitPrice: number | null = batch.unitCost !== undefined && batch.unitCost !== null
      ? batch.unitCost
      : null;
    let totalLoss: number | null = unitPrice !== null ? unitPrice * removedQty : null;
    let valuationMethod: 'BATCH_COST' | 'HISTORICAL_TRANSACTION' | 'COMMODITY_BASE' | 'UNAVAILABLE' = 
      unitPrice !== null ? 'BATCH_COST' : 'UNAVAILABLE';
    let valuationUnavailable = unitPrice === null;

    if (valuationUnavailable && this.valuationResolver) {
      const resolved = this.valuationResolver(productId, inventory.ownerId, removedQty);
      if (resolved && resolved.unitPrice !== null && resolved.unitPrice !== undefined) {
        unitPrice = resolved.unitPrice;
        totalLoss = resolved.totalLoss ?? (unitPrice * removedQty);
        valuationMethod = resolved.valuationMethod;
        valuationUnavailable = false;
      }
    }

    const record: SpoilageRecord = {
      id: recordId,
      inventoryId: inventory.id,
      ownerId: inventory.ownerId,
      productId,
      quantity: removedQty,
      unit: item?.unit || 'unit',
      batchAcquiredAt: batch.acquiredAt,
      batchExpiryAt: batch.expiryAt ?? currentTime,
      batchId: batch.id,
      timestamp: currentTime,
      unitPrice,
      totalLoss,
      valuationUnavailable,
      valuationMethod,
      createdAt: new Date()
    };

    if (this.spoilageLedger) {
      this.spoilageLedger.record(record);
    }

    return record;
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
