import { ConsumptionRecord } from './ConsumptionTypes';

export interface ConsumptionFilter {
  commodityId?: string;
  regionId?: string;
  fromTimestamp?: number;
  toTimestamp?: number;
}

export class ConsumptionLedger {
  private records: ConsumptionRecord[] = [];
  private seenEventIds: Set<string> = new Set();
  private listeners: ((record: ConsumptionRecord) => void)[] = [];

  /**
   * Append a new consumption record.
   * Enforces idempotency via unique eventId and validates positive quantity.
   * Returns true if successfully recorded, false if duplicate or invalid.
   */
  public record(entry: ConsumptionRecord): boolean {
    if (!entry || !entry.eventId || entry.quantity <= 0) {
      return false;
    }

    if (this.seenEventIds.has(entry.eventId)) {
      return false; // Idempotent deduplication
    }

    // Freeze record clone for immutability
    const immutableEntry: ConsumptionRecord = Object.freeze({
      ...entry,
      createdAt: entry.createdAt ? new Date(entry.createdAt) : new Date()
    });

    this.seenEventIds.add(immutableEntry.eventId);
    this.records.push(immutableEntry);

    // Notify listeners
    for (const listener of this.listeners) {
      try {
        listener(immutableEntry);
      } catch (err) {
        console.error('Error in ConsumptionLedger listener:', err);
      }
    }

    return true;
  }

  /**
   * Check whether an event ID has already been recorded or hydrated from persistence.
   */
  public hasEvent(eventId: string): boolean {
    if (!eventId) return false;
    return this.seenEventIds.has(eventId);
  }

  /**
   * Subscribe to new consumption records.
   */
  public onRecord(listener: (record: ConsumptionRecord) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  /**
   * Retrieve records matching optional filters.
   */
  public getRecords(filter?: ConsumptionFilter): ConsumptionRecord[] {
    return this.records.filter(r => {
      if (filter?.commodityId && r.commodityId !== filter.commodityId) return false;
      if (filter?.regionId && r.regionId !== filter.regionId) return false;
      if (filter?.fromTimestamp !== undefined && r.timestamp < filter.fromTimestamp) return false;
      if (filter?.toTimestamp !== undefined && r.timestamp > filter.toTimestamp) return false;
      return true;
    });
  }

  /**
   * Calculate total quantity consumed for a commodity in a given time window.
   */
  public getTotalQuantity(commodityId: string, regionId?: string, fromTimestamp?: number, toTimestamp?: number): number {
    const matching = this.getRecords({ commodityId, regionId, fromTimestamp, toTimestamp });
    return matching.reduce((sum, r) => sum + r.quantity, 0);
  }

  /**
   * Bulk load historical records (e.g. hydrating from database on startup).
   */
  public loadRecords(records: ConsumptionRecord[]): void {
    for (const record of records) {
      if (record && record.eventId && record.quantity > 0 && !this.seenEventIds.has(record.eventId)) {
        this.seenEventIds.add(record.eventId);
        this.records.push(Object.freeze({ ...record }));
      }
    }
  }

  /**
   * Returns total count of unique recorded consumption events.
   */
  public count(): number {
    return this.records.length;
  }

  /**
   * Clear all records (useful for test isolation).
   */
  public clear(): void {
    this.records = [];
    this.seenEventIds.clear();
  }
}
