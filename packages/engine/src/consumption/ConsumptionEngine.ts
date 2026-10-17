import { Citizen, Commodity, TransactionType, TransactionRecord } from '@genesis/shared';
import { InventoryManager } from '../inventory/InventoryManager';
import { NeedsService } from '../citizen/services/NeedsService';
import { ConsumptionLedger } from './ConsumptionLedger';
import { ConsumptionRecord } from './ConsumptionTypes';
import { ResourceConsumptionEngine } from '../resources/ResourceConsumptionEngine';
import { MarketEngine } from '../market/MarketEngine';
import { randomUUID } from 'crypto';

export type ConsumableNeedType = 'HUNGER' | 'THIRST' | 'HEALTH' | 'ENERGY';

export class ConsumptionEngine {
  private lastRecordedEvent?: ConsumptionRecord;
  private regionResolver?: (citizen: Citizen) => string | undefined;
  private resourceConsumptionEngine?: ResourceConsumptionEngine;
  private marketEngine?: MarketEngine;
  private waterTariffPerLitre: number = 0.05; // 0.05 credits/L
  private waterConnectionChecker?: (citizen: Citizen) => { connected: boolean; buildingId?: string; regionId?: string };
  private utilityPayeeResolver?: (regionId: string) => string | undefined;
  private processedEventIds: Set<string> = new Set();

  constructor(
    private inventoryManager: InventoryManager,
    private needsService: NeedsService,
    private getCommodity: (productId: string) => Commodity | undefined,
    private consumptionLedger?: ConsumptionLedger,
    private onConsumptionCallback?: (record: ConsumptionRecord) => void
  ) {}

  public setResourceConsumptionEngine(engine: ResourceConsumptionEngine): void {
    this.resourceConsumptionEngine = engine;
  }

  public getResourceConsumptionEngine(): ResourceConsumptionEngine | undefined {
    return this.resourceConsumptionEngine;
  }

  public setMarketEngine(engine: MarketEngine): void {
    this.marketEngine = engine;
  }

  public getMarketEngine(): MarketEngine | undefined {
    return this.marketEngine;
  }

  public setWaterTariff(tariff: number): void {
    this.waterTariffPerLitre = Math.max(0, tariff);
  }

  public getWaterTariff(): number {
    return this.waterTariffPerLitre;
  }

  public setWaterConnectionChecker(
    checker: (citizen: Citizen) => { connected: boolean; buildingId?: string; regionId?: string }
  ): void {
    this.waterConnectionChecker = checker;
  }

  public setUtilityPayeeResolver(resolver: (regionId: string) => string | undefined): void {
    this.utilityPayeeResolver = resolver;
  }

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
    // Idempotency: Replayed or duplicate action/event IDs do not duplicate extraction, charges, or thirst restoration
    if (eventId) {
      if (this.processedEventIds.has(eventId) || (this.consumptionLedger && this.consumptionLedger.hasEvent(eventId))) {
        return true;
      }
    }

    if (!citizen.householdId) return false;

    // 1. Path A: Check if a physical consumable exists in household inventory (e.g. bottled water, food)
    const inventory = this.inventoryManager.getInventoryByOwner(citizen.householdId);
    const consumable = inventory ? this.getUsableConsumable(citizen, currentTime, needType) : null;

    if (consumable && inventory) {
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

        if (eventId) {
          this.processedEventIds.add(eventId);
        }

        return true;
      }
      
      return false;
    }

    // 2. Path B: If NO usable bottled water in inventory and needType is THIRST, attempt residential tap water
    if (needType === 'THIRST') {
      return this.consumeResidentialTapWater(citizen, currentTime, targetValue, eventId, context, regionId);
    }

    return false;
  }

  /**
   * Fulfills citizen thirst via residential tap water drawn directly from regional resources.
   * Physically extracts from canonical regional ResourceType.WATER, charges citizen via MarketEngine,
   * restores thirst proportionally, and records durable consumption in the ledger.
   */
  private consumeResidentialTapWater(
    citizen: Citizen,
    currentTime: number,
    targetValue?: number,
    eventId?: string,
    context?: string,
    regionId?: string
  ): boolean {
    if (!citizen.householdId) return false;

    // Check residential water connection
    let hasConnection = false;
    let resolvedBuildingId: string | undefined = undefined;
    let effectiveRegionId = regionId;

    if (this.waterConnectionChecker) {
      const check = this.waterConnectionChecker(citizen);
      hasConnection = check.connected;
      resolvedBuildingId = check.buildingId;
      if (!effectiveRegionId && check.regionId) {
        effectiveRegionId = check.regionId;
      }
    }

    if (!hasConnection) {
      return false; // Building has no functioning water connection
    }

    if (!effectiveRegionId) {
      effectiveRegionId = (this.regionResolver ? this.regionResolver(citizen) : undefined) || 'DEFAULT';
    }

    // Enforce location: citizen must be at their residence if building location is known
    if (citizen.locationId && resolvedBuildingId && citizen.locationId !== resolvedBuildingId) {
      return false; // Citizen not at residence
    }

    // Determine required restoration
    const currentThirst = citizen.vitalState.thirst;
    const actualTarget = targetValue ?? 20;
    const requiredRestoration = this.calculateRequiredRestoration(currentThirst, actualTarget);
    if (requiredRestoration <= 0) {
      return true; // Already satisfied
    }

    // Commodity restoration rate: 1 L of water restores 25 thirst
    const waterCommodity = this.getCommodity('water');
    const restorationPerLitre = waterCommodity?.consumable?.restorationValue ?? 25;
    const requestedLitres = Math.max(1, Math.ceil(requiredRestoration / restorationPerLitre));

    // Pre-check citizen funds against tariff
    const tariff = this.waterTariffPerLitre;
    const estimatedCost = Number((requestedLitres * tariff).toFixed(4));

    if (!citizen.wallet || citizen.wallet.balance < estimatedCost) {
      return false; // Insufficient funds: do not extract or provide unpaid water
    }

    if (!this.resourceConsumptionEngine) {
      return false; // No physical resource engine available
    }

    const txId = eventId ? `tx-tap-${eventId}` : undefined;
    const isExistingUnreversedTx = !!(
      txId &&
      this.marketEngine &&
      this.marketEngine.hasTransaction(txId) &&
      !this.marketEngine.isTransactionReversed(txId)
    );

    let actualLitres = 0;
    if (isExistingUnreversedTx) {
      // Re-use already extracted/billed quantity from existing transaction
      const existingTx = this.marketEngine!.getTransaction(txId!)!;
      actualLitres = existingTx.quantity || requestedLitres;
    } else {
      // Physically extract water from regional resource (1 m³ = 1000 L)
      const extraction = this.resourceConsumptionEngine.extractDomesticWater(effectiveRegionId, requestedLitres);
      if (!extraction.success || extraction.extractedLitres <= 0) {
        return false; // Reservoir depleted or unavailable: tap runs dry
      }
      actualLitres = extraction.extractedLitres;
    }

    const actualCost = Number((actualLitres * tariff).toFixed(4));

    // Execute economic transaction through MarketEngine
    let tx: TransactionRecord | null = null;
    if (this.marketEngine) {
      let payeeId = this.utilityPayeeResolver ? this.utilityPayeeResolver(effectiveRegionId) : undefined;
      if (!payeeId) {
        const utilityWallet = this.marketEngine.getOrCreateUtilityWallet(effectiveRegionId);
        payeeId = utilityWallet.ownerId;
      }

      tx = this.marketEngine.processTransaction(
        citizen.id,
        payeeId,
        'water',
        actualLitres,
        'L',
        tariff,
        actualCost,
        citizen.wallet.currency || 'GEN',
        TransactionType.EXPENSE,
        effectiveRegionId,
        txId
      );

      if (!tx) {
        // Multi-step compensating transaction: refund physical water if billing fails!
        if (!isExistingUnreversedTx) {
          this.resourceConsumptionEngine.refundDomesticWater(effectiveRegionId, actualLitres);
        }
        return false;
      }
    }

    // Now execute downstream operations with full partial-failure compensation
    let thirstSatisfied = false;
    let actualRestoration = 0;

    try {
      // Fulfill thirst strictly based on actual water delivered
      actualRestoration = actualLitres * restorationPerLitre;
      this.needsService.satisfyThirst(citizen, actualRestoration);
      thirstSatisfied = true;

      // Record durable consumption in ledger
      const simDay = Math.floor(currentTime / 86400) + 1;
      const simHour = Math.floor((currentTime % 86400) / 3600);

      const record: ConsumptionRecord = {
        eventId: eventId || randomUUID(),
        timestamp: currentTime,
        simulationDay: simDay,
        simulationHour: simHour,
        consumerId: citizen.id,
        householdId: citizen.householdId,
        sourceInventoryId: undefined, // piped water has no source inventory
        commodityId: 'water',
        quantity: actualLitres,
        unit: 'L',
        context: context || 'RESIDENTIAL_WATER',
        regionId: effectiveRegionId,
        createdAt: new Date()
      };

      if (this.consumptionLedger) {
        const recorded = this.consumptionLedger.record(record);
        if (!recorded) {
          throw new Error(`ConsumptionLedger rejected record for event ${record.eventId}`);
        }
      }

      this.lastRecordedEvent = record;

      if (this.onConsumptionCallback) {
        try {
          this.onConsumptionCallback(record);
        } catch (err) {
          console.error('Error in ConsumptionEngine onConsumption callback:', err);
        }
      }

      if (eventId) {
        this.processedEventIds.add(eventId);
      }

      return true;
    } catch (err) {
      console.error(`[ConsumptionEngine] Downstream failure during tap water consumption (eventId: ${eventId}):`, err);

      // 1. Revert thirst if satisfied
      if (thirstSatisfied) {
        try {
          citizen.vitalState.thirst = Math.min(100, citizen.vitalState.thirst + actualRestoration);
        } catch (revertErr) {
          console.error(`[ConsumptionEngine] Failed to revert thirst for citizen ${citizen.id}:`, revertErr);
        }
      }

      // 2. Reverse financial transaction if executed
      if (this.marketEngine && tx && tx.transactionId) {
        const reversalTxId = `${tx.transactionId}-reversal`;
        try {
          this.marketEngine.reverseTransaction(
            tx.transactionId,
            reversalTxId,
            `Compensating reversal for failed consumption event ${eventId}`
          );
        } catch (revErr) {
          console.error(`[ConsumptionEngine] Failed to reverse transaction ${tx.transactionId}:`, revErr);
        }
      }

      // 3. Refund physical water back to regional reservoir
      if (!isExistingUnreversedTx) {
        try {
          this.resourceConsumptionEngine.refundDomesticWater(effectiveRegionId, actualLitres);
        } catch (refundErr) {
          console.error(`[ConsumptionEngine] Failed to refund domestic water to region ${effectiveRegionId}:`, refundErr);
        }
      }

      return false;
    }
  }
}
