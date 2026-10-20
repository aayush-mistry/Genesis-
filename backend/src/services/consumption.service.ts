import { ConsumptionLedger, DemandForecastingEngine, ConsumptionRecord, ForecastResult } from '@genesis/engine';
import { consumptionRepository } from '../repositories/ConsumptionRepository';
import { timeService } from './time.service';
import { TimeUtils } from '@genesis/engine';

export interface SupplyBalanceAnalysis {
  commodityId: string;
  regionId?: string;
  unit: string;
  historicalConsumption: {
    total: number;
    eventsCount: number;
    windowDays: number;
  };
  forecast: {
    status: string;
    dataSufficiency: boolean;
    horizonDays: number;
    forecastDemand: number | null;
    dailyConsumptionRate: number | null;
    explanation: string;
  };
  supply: {
    availableInventory: number;
    inboundSupply: number;
    totalProjectedSupply: number;
  };
  analysis: {
    projectedNet: number | null;
    condition: 'SHORTAGE' | 'SURPLUS' | 'UNAVAILABLE';
  };
}

export class BackendConsumptionService {
  public consumptionLedger: ConsumptionLedger;
  public forecastingEngine: DemandForecastingEngine;
  private isInitialized = false;
  private pendingWrites: Set<Promise<any>> = new Set();
  private failedWrites: Array<{ eventId: string; error: any; record: ConsumptionRecord }> = [];
  private durablyPersistedEventIds: Set<string> = new Set();

  constructor() {
    this.consumptionLedger = new ConsumptionLedger();
    this.forecastingEngine = new DemandForecastingEngine(
      this.consumptionLedger,
      (commodityId: string) => {
        if (commodityId === 'water') return 'L';
        return 'kg';
      }
    );
  }

  public initialize(): void {
    if (this.isInitialized) return;
    this.isInitialized = true;

    // Listen to in-memory ledger events and persist them durably to SQLite via Prisma
    this.consumptionLedger.onRecord((record: ConsumptionRecord) => {
      this.enqueuePersistence(record);
    });

    // Wire forecasting engine into BusinessProcurementEngine
    import('./supply.service').then(({ supplyService }) => {
      if (supplyService && supplyService.businessProcurementEngine) {
        supplyService.businessProcurementEngine.setDemandForecaster(this.forecastingEngine);
      }
    });

    console.log('[Consumption Service] Initialized with durable ledger and forecasting engine');
  }

  /**
   * Enqueues an asynchronous persistence operation to SQLite via Prisma.
   * Tracks in-flight promises and evicts from the in-memory ledger if persistence fails.
   */
  public enqueuePersistence(record: ConsumptionRecord): Promise<any> {
    const writePromise = (async () => {
      try {
        const result = await consumptionRepository.recordConsumption({
          eventId: record.eventId,
          timestamp: record.timestamp,
          simulationDay: record.simulationDay,
          simulationHour: record.simulationHour,
          consumerId: record.consumerId,
          householdId: record.householdId,
          sourceInventoryId: record.sourceInventoryId,
          commodityId: record.commodityId,
          quantity: record.quantity,
          unit: record.unit,
          context: record.context,
          worldId: record.worldId,
          regionId: record.regionId
        });
        if (result) {
          this.durablyPersistedEventIds.add(record.eventId);
        }
        return result;
      } catch (err) {
        console.error(`[ConsumptionService] Failed to persist consumption record ${record.eventId}:`, err);
        // Evict from in-memory ledger so system does not believe it was durably saved
        this.consumptionLedger.evict(record.eventId);
        this.failedWrites.push({ eventId: record.eventId, error: err, record });
        return { ok: false, error: err, eventId: record.eventId };
      }
    })();

    this.pendingWrites.add(writePromise);
    writePromise.finally(() => {
      this.pendingWrites.delete(writePromise);
    });

    return writePromise;
  }

  /**
   * Awaits all pending consumption persistence writes and surfaces any errors.
   */
  public async flush(): Promise<void> {
    while (this.pendingWrites.size > 0) {
      const currentBatch = Array.from(this.pendingWrites);
      await Promise.all(currentBatch);
    }

    if (this.failedWrites.length > 0) {
      const failures = [...this.failedWrites];
      this.failedWrites = [];
      const err = new Error(
        `[ConsumptionService] Persistence flush failed for ${failures.length} write(s): ${failures.map(f => f.error?.message || String(f.error)).join('; ')}`
      );
      (err as any).errors = failures.map(f => f.error);
      throw err;
    }
  }

  /**
   * Returns true if the event has been successfully written to durable database storage.
   */
  public isDurable(eventId: string): boolean {
    return this.durablyPersistedEventIds.has(eventId);
  }

  /**
   * Number of pending persistence operations currently in flight.
   */
  public getPendingCount(): number {
    return this.pendingWrites.size;
  }

  /**
   * Returns list of failed persistence writes since last flush.
   */
  public getFailedWrites(): Array<{ eventId: string; error: any; record: ConsumptionRecord }> {
    return [...this.failedWrites];
  }

  /**
   * Resets ledger, in-flight tracking, and durability cache.
   */
  public reset(): void {
    this.consumptionLedger.clear();
    this.pendingWrites.clear();
    this.failedWrites = [];
    this.durablyPersistedEventIds.clear();
  }

  /**
   * Hydrates the in-memory ledger from persistent SQLite records during bootstrap (survives cold restart).
   */
  public async hydrateFromDatabase(regionId?: string): Promise<number> {
    const records = await consumptionRepository.findHistory({ regionId, limit: 10000 });
    const mapped: ConsumptionRecord[] = records.map(r => ({
      eventId: r.eventId,
      timestamp: r.timestamp,
      simulationDay: r.simulationDay ?? undefined,
      simulationHour: r.simulationHour ?? undefined,
      consumerId: r.consumerId ?? undefined,
      householdId: r.householdId ?? undefined,
      sourceInventoryId: r.sourceInventoryId ?? undefined,
      commodityId: r.commodityId,
      quantity: r.quantity,
      unit: r.unit,
      context: r.context,
      worldId: r.worldId ?? undefined,
      regionId: r.regionId ?? undefined,
      createdAt: r.createdAt
    }));

    this.consumptionLedger.loadRecords(mapped);
    for (const r of mapped) {
      this.durablyPersistedEventIds.add(r.eventId);
    }
    console.log(`[Consumption Service] Hydrated ${mapped.length} consumption records from persistence.`);
    return mapped.length;
  }

  /**
   * Records a consumption event both in-memory and in persistent storage.
   * Awaits durable completion before returning.
   */
  public async recordConsumption(record: ConsumptionRecord): Promise<boolean> {
    const accepted = this.consumptionLedger.record(record);
    if (accepted) {
      await this.flush();
      return true;
    }
    return false;
  }

  /**
   * Generates a demand forecast for a given commodity and region.
   */
  public getDemandForecast(
    commodityId: string,
    regionId?: string,
    horizonDays: number = 1,
    windowDays: number = 7
  ): ForecastResult {
    const currentSeconds = TimeUtils.toSeconds(timeService.engine.getCurrentTime());
    return this.forecastingEngine.forecast(commodityId, regionId, currentSeconds, {
      forecastHorizonDays: horizonDays,
      observationWindowDays: windowDays
    });
  }

  /**
   * Computes a full projected supply balance comparing forecast demand against sellable inventory & inbound supply.
   */
  public async getProjectedSupplyBalance(
    commodityId: string,
    regionId?: string,
    horizonDays: number = 1,
    windowDays: number = 7
  ): Promise<SupplyBalanceAnalysis> {
    const currentSeconds = TimeUtils.toSeconds(timeService.engine.getCurrentTime());
    const windowStartSeconds = Math.max(0, currentSeconds - (windowDays * 86400));

    // 1. Historical totals
    const history = this.consumptionLedger.getRecords({
      commodityId,
      regionId,
      fromTimestamp: windowStartSeconds,
      toTimestamp: currentSeconds
    });
    const totalHistorical = history.reduce((sum, r) => sum + r.quantity, 0);

    // 2. Forecast
    const forecast = this.forecastingEngine.forecast(commodityId, regionId, currentSeconds, {
      forecastHorizonDays: horizonDays,
      observationWindowDays: windowDays
    });

    // 3. Available Inventory from authoritative inventoryManager
    const { supplyService } = await import('./supply.service');
    let availableInventory = 0;
    const allInventories = supplyService.inventoryManager.getAllInventories();

    for (const inv of allInventories) {
      // If regionId specified, filter workplaces in that region
      if (regionId) {
        const { worldService } = await import('./world.service');
        const wp = worldService.engine.workplaceRepository.findById(inv.ownerId);
        if (!wp || wp.regionId !== regionId) continue;
      }
      const item = inv.items[commodityId];
      if (item) {
        availableInventory += item.availableQuantity;
      }
    }

    // 4. Inbound supply from active shipments / pending orders
    let inboundSupply = 0;
    try {
      const activeShipments = supplyService.supplyChainEngine.getAllActiveShipments();
      for (const ship of activeShipments) {
        if (ship.productId === commodityId) {
          if (!regionId) {
            inboundSupply += ship.quantity;
          } else {
            const { worldService } = await import('./world.service');
            const destWp = worldService.engine.workplaceRepository.findById(ship.destinationId);
            if (destWp && destWp.regionId === regionId) {
              inboundSupply += ship.quantity;
            }
          }
        }
      }
    } catch (e) {}

    const totalProjectedSupply = availableInventory + inboundSupply;

    // 5. Projected Net Balance & Shortage Analysis
    let projectedNet: number | null = null;
    let condition: 'SHORTAGE' | 'SURPLUS' | 'UNAVAILABLE' = 'UNAVAILABLE';

    if (forecast.dataSufficiency && forecast.forecastDemand !== null) {
      projectedNet = Number((totalProjectedSupply - forecast.forecastDemand).toFixed(4));
      condition = projectedNet < 0 ? 'SHORTAGE' : 'SURPLUS';
    }

    return {
      commodityId,
      regionId,
      unit: forecast.unit,
      historicalConsumption: {
        total: Number(totalHistorical.toFixed(4)),
        eventsCount: history.length,
        windowDays
      },
      forecast: {
        status: forecast.status,
        dataSufficiency: forecast.dataSufficiency,
        horizonDays,
        forecastDemand: forecast.forecastDemand,
        dailyConsumptionRate: forecast.dailyConsumptionRate,
        explanation: forecast.explanation
      },
      supply: {
        availableInventory: Number(availableInventory.toFixed(4)),
        inboundSupply: Number(inboundSupply.toFixed(4)),
        totalProjectedSupply: Number(totalProjectedSupply.toFixed(4))
      },
      analysis: {
        projectedNet,
        condition
      }
    };
  }
}

export const consumptionService = new BackendConsumptionService();
