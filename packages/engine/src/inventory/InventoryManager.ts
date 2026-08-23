import { Inventory, InventoryItem } from '@genesis/shared';

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

  public addItemQuantity(inventoryId: string, productId: string, quantity: number, unit: string): boolean {
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
        unit
      };
    }

    inventory.items[productId].totalQuantity += quantity;
    this.updateAvailable(inventory.items[productId]);

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

  private updateAvailable(item: InventoryItem): void {
    item.availableQuantity = item.totalQuantity - item.reservedQuantity;
  }
}
