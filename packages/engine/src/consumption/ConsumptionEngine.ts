import { Citizen, Commodity } from '@genesis/shared';
import { InventoryManager } from '../inventory/InventoryManager';
import { NeedsService } from '../citizen/services/NeedsService';

export type ConsumableNeedType = 'HUNGER' | 'THIRST' | 'HEALTH' | 'ENERGY';

export class ConsumptionEngine {
  constructor(
    private inventoryManager: InventoryManager,
    private needsService: NeedsService,
    private getCommodity: (productId: string) => Commodity | undefined
  ) {}

  public calculateRequiredRestoration(currentValue: number, targetValue: number = 20): number {
    return Math.max(0, currentValue - targetValue);
  }

  public getUsableConsumable(citizen: Citizen, currentTime: number, needType: ConsumableNeedType) {
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

  public consume(citizen: Citizen, needType: ConsumableNeedType, currentTime: number, targetValue?: number): boolean {
    const inventory = this.inventoryManager.getInventoryByOwner(citizen.id);
    if (!inventory) return false;

    const consumable = this.getUsableConsumable(citizen, currentTime, needType);
    if (!consumable) return false;

    let currentNeedValue = 0;
    let actualTargetValue = targetValue ?? 20;

    switch (needType) {
      case 'HUNGER':
        currentNeedValue = citizen.vitalState.hunger;
        break;
      case 'THIRST':
        currentNeedValue = citizen.vitalState.thirst;
        break;
      case 'HEALTH':
        // For health and energy, they are 0-100 where 100 is best. 
        // We want to restore up to 100.
        currentNeedValue = 100 - citizen.vitalState.health;
        actualTargetValue = targetValue ?? 0; // We want missing health to be 0
        break;
      case 'ENERGY':
        currentNeedValue = 100 - citizen.vitalState.energy;
        actualTargetValue = targetValue ?? 0;
        break;
    }

    const requiredRestoration = this.calculateRequiredRestoration(currentNeedValue, actualTargetValue);
    if (requiredRestoration <= 0) return true; // Already satisfied

    const requiredQuantity = Math.ceil(requiredRestoration / consumable.restorationValue);
    const actualQuantityToConsume = Math.min(requiredQuantity, consumable.quantity);

    if (actualQuantityToConsume <= 0) return false;

    const success = this.inventoryManager.removeItemQuantity(inventory.id, consumable.productId, actualQuantityToConsume);
    
    if (success) {
      const actualRestoration = actualQuantityToConsume * consumable.restorationValue;
      switch (needType) {
        case 'HUNGER':
          this.needsService.satisfyHunger(citizen, actualRestoration);
          break;
        case 'THIRST':
          this.needsService.satisfyThirst(citizen, actualRestoration);
          break;
        case 'HEALTH':
          this.needsService.restoreHealth(citizen, actualRestoration);
          break;
        case 'ENERGY':
          this.needsService.recoverEnergy(citizen, actualRestoration);
          break;
      }
      return true;
    }
    
    return false;
  }
}

