import { Citizen, Commodity } from '@genesis/shared';
import { InventoryManager } from '../inventory/InventoryManager';
import { NeedsService } from '../citizen/services/NeedsService';
import { ProductManager } from '../supply/ProductManager'; // Assume there is some way to get commodities

export class ConsumptionEngine {
  constructor(
    private inventoryManager: InventoryManager,
    private needsService: NeedsService,
    private getCommodity: (productId: string) => Commodity | undefined
  ) {}

  public calculateRequiredRestoration(currentValue: number, targetValue: number = 20): number {
    return Math.max(0, currentValue - targetValue);
  }

  public getUsableFood(citizen: Citizen, currentTime: number): { productId: string, quantity: number, restorationValue: number } | null {
    return this.getUsableConsumable(citizen, currentTime, 'HUNGER');
  }

  public getUsableWater(citizen: Citizen, currentTime: number): { productId: string, quantity: number, restorationValue: number } | null {
    return this.getUsableConsumable(citizen, currentTime, 'THIRST');
  }

  private getUsableConsumable(citizen: Citizen, currentTime: number, needType: 'HUNGER' | 'THIRST') {
    const inventory = this.inventoryManager.getInventoryByOwner(citizen.id);
    if (!inventory) return null;

    for (const [productId, item] of Object.entries(inventory.items)) {
      const commodity = this.getCommodity(productId);
      if (commodity?.consumable?.restorationNeed === needType) {
        const usableQuantity = this.inventoryManager.getUsableQuantity(inventory.id, productId, currentTime);
        if (usableQuantity > 0) {
          return {
            productId,
            quantity: usableQuantity,
            restorationValue: commodity.consumable.restorationValue
          };
        }
      }
    }
    
    return null;
  }

  public consume(citizen: Citizen, needType: 'HUNGER' | 'THIRST', currentTime: number, targetValue: number = 20): boolean {
    const inventory = this.inventoryManager.getInventoryByOwner(citizen.id);
    if (!inventory) return false;

    const consumable = needType === 'HUNGER' ? this.getUsableFood(citizen, currentTime) : this.getUsableWater(citizen, currentTime);
    
    if (!consumable) return false;

    const currentNeedValue = needType === 'HUNGER' ? citizen.vitalState.hunger : citizen.vitalState.thirst;
    const requiredRestoration = this.calculateRequiredRestoration(currentNeedValue, targetValue);
    
    if (requiredRestoration <= 0) return true; // Already satisfied

    const requiredQuantity = Math.ceil(requiredRestoration / consumable.restorationValue);
    const actualQuantityToConsume = Math.min(requiredQuantity, consumable.quantity);

    if (actualQuantityToConsume <= 0) return false;

    const success = this.inventoryManager.removeItemQuantity(inventory.id, consumable.productId, actualQuantityToConsume);
    
    if (success) {
      const actualRestoration = actualQuantityToConsume * consumable.restorationValue;
      if (needType === 'HUNGER') {
        this.needsService.satisfyHunger(citizen, actualRestoration);
      } else {
        this.needsService.satisfyThirst(citizen, actualRestoration);
      }
      return true;
    }
    
    return false;
  }
}
