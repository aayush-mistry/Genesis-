import { Citizen, Commodity } from '@genesis/shared';
import { InventoryManager } from '../inventory/InventoryManager';
import { NeedsService } from '../citizen/services/NeedsService';
import { ConsumptionLedger } from './ConsumptionLedger';
import { ConsumptionRecord } from './ConsumptionTypes';
import { randomUUID } from 'crypto';

export type ConsumableNeedType = 'HUNGER' | 'THIRST' | 'HEALTH' | 'ENERGY';

export class ConsumptionEngine {
  private lastRecordedEvent?: ConsumptionRecord;
  private regionResolver?: (citizen: Citizen) => string | undefined;

  constructor(
    private inventoryManager: InventoryManager,
    private needsService: NeedsService,
    private getCommodity: (productId: string) => Commodity | undefined,
    private consumptionLedger?: ConsumptionLedger,
    private onConsumptionCallback?: (record: ConsumptionRecord) => void
  ) {}

  public setConsumptionLedger(ledger: ConsumptionLedger): void {
    this.consumptionLedger = ledger;
  }

  public getConsumptionLedger(): ConsumptionLedger | undefined {
    return this.consumptionLedger;
  }

  public setRegionResolver(resolver: (citizen: Citizen) => string | undefined): void {
    this.regionResolver = resolver;
  }

  public setOnConsumption(callback: (record: ConsumptionRecord) => void): void {
    this.onConsumptionCallback = callback;
  }

  public getLastRecordedEvent(): ConsumptionRecord | undefined {
    return this.lastRecordedEvent;
  }

  public calculateRequiredRestoration(currentValue: number, targetValue: number = 20): number {
    return Math.max(0, currentValue - targetValue);
  }

  public getUsableConsumable(citizen: Citizen, currentTime: number, needType: ConsumableNeedType) {
    if (!citizen.householdId) return null;
    const inventory = this.inventoryManager.getInventoryByOwner(citizen.householdId);
    if (!inventory) return null;

    for (const [productId] of Object.entries(inventory.items)) {
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

  public consume(
    citizen: Citizen, 
    needType: ConsumableNeedType, 
    currentTime: number, 
    targetValue?: number,
    eventId?: string,
    context?: string,
    regionId?: string
  ): boolean {
    if (!citizen.householdId) return false;
    const inventory = this.inventoryManager.getInventoryByOwner(citizen.householdId);
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
        currentNeedValue = 100 - citizen.vitalState.health;
        actualTargetValue = targetValue ?? 0;
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

    // Mutate inventory first
    const success = this.inventoryManager.removeItemQuantity(inventory.id, consumable.productId, actualQuantityToConsume);
    
    if (success) {
      // Satisfy citizen vital state
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

      // Record durable consumption only after inventory mutation succeeds
      const commodity = this.getCommodity(consumable.productId);
      const effectiveRegionId = regionId || (this.regionResolver ? this.regionResolver(citizen) : undefined) || 'DEFAULT';
      
      const simDay = Math.floor(currentTime / 86400) + 1;
      const simHour = Math.floor((currentTime % 86400) / 3600);

      const record: ConsumptionRecord = {
        eventId: eventId || randomUUID(),
        timestamp: currentTime,
        simulationDay: simDay,
        simulationHour: simHour,
        consumerId: citizen.id,
        householdId: citizen.householdId,
        sourceInventoryId: inventory.id,
        commodityId: consumable.productId,
        quantity: actualQuantityToConsume,
        unit: commodity?.unit || 'kg',
        context: context || 'CITIZEN_NEED',
        regionId: effectiveRegionId,
        createdAt: new Date()
      };

      this.lastRecordedEvent = record;

      if (this.consumptionLedger) {
        this.consumptionLedger.record(record);
      }

      if (this.onConsumptionCallback) {
        try {
          this.onConsumptionCallback(record);
        } catch (err) {
          console.error('Error in ConsumptionEngine onConsumption callback:', err);
        }
      }

      return true;
    }
    
    return false;
  }
}
