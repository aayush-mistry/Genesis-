import { SpoilageRecord } from '@genesis/shared';

export interface SpoilageFilter {
  ownerId?: string;
  inventoryId?: string;
  productId?: string;
  regionId?: string;
  fromTimestamp?: number;
  toTimestamp?: number;
}

export class SpoilageLedger {
  private records: SpoilageRecord[] = [];
  private seenRecordIds: Set<string> = new Set();
  private listeners: ((record: SpoilageRecord) => void)[] = [];

  /**
   * Append a new spoilage record.
   * Enforces idempotency via unique id and validates positive quantity.
   * Returns true if successfully recorded, false if duplicate or invalid.
   */
  public record(entry: SpoilageRecord): boolean {
    if (!entry || !entry.id || entry.quantity <= 0) {
      return false;
    }

    if (this.seenRecordIds.has(entry.id)) {
      return false; // Idempotent deduplication
    }

    // Freeze record clone for immutability
    const immutableEntry: SpoilageRecord = Object.freeze({
      ...entry,
      createdAt: entry.createdAt ? new Date(entry.createdAt) : new Date()
    });

    this.seenRecordIds.add(immutableEntry.id);
    this.records.push(immutableEntry);

    // Notify listeners
    for (const listener of this.listeners) {
      try {
        listener(immutableEntry);
      } catch (err) {
        console.error('[SpoilageLedger] Error in listener:', err);
      }
    }

    return true;
  }

  /**
   * Check whether a spoilage ID has already been recorded or hydrated.
   */
  public hasRecord(id: string): boolean {
    if (!id) return false;
    return this.seenRecordIds.has(id);
  }

  /**
   * Retrieve a specific spoilage record by ID.
   */
  public getRecord(id: string): SpoilageRecord | undefined {
    return this.records.find(r => r.id === id);
  }

  /**
   * Subscribe to new spoilage records.
   */
  public onRecord(listener: (record: SpoilageRecord) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  /**
   * Retrieve records matching optional filters.
   */
  public getRecords(filter?: SpoilageFilter): SpoilageRecord[] {
    return this.records.filter(r => {
      if (filter?.ownerId && r.ownerId !== filter.ownerId) return false;
      if (filter?.inventoryId && r.inventoryId !== filter.inventoryId) return false;
      if (filter?.productId && r.productId !== filter.productId) return false;
      if (filter?.regionId && r.regionId !== filter.regionId) return false;
      if (filter?.fromTimestamp !== undefined && r.timestamp < filter.fromTimestamp) return false;
      if (filter?.toTimestamp !== undefined && r.timestamp > filter.toTimestamp) return false;
      return true;
    });
  }

  /**
   * Calculate total financial loss for records matching filters (ignoring unavailable valuations).
   */
  public getTotalLoss(ownerId?: string, productId?: string): number {
    const matching = this.getRecords({ ownerId, productId });
    return matching.reduce((sum, r) => sum + (r.totalLoss ?? 0), 0);
  }

  /**
   * Calculate total quantity spoiled for matching records.
   */
  public getTotalSpoiledQuantity(productId?: string, ownerId?: string): number {
    const matching = this.getRecords({ productId, ownerId });
    return matching.reduce((sum, r) => sum + r.quantity, 0);
  }

  /**
   * Bulk load historical records (e.g. hydrating from database on startup).
   */
  public loadRecords(records: SpoilageRecord[]): void {
    for (const record of records) {
      if (record && record.id && record.quantity > 0 && !this.seenRecordIds.has(record.id)) {
        this.seenRecordIds.add(record.id);
        this.records.push(Object.freeze({ ...record }));
      }
    }
  }

  /**
   * Returns total count of unique recorded spoilage events.
   */
  public count(): number {
    return this.records.length;
  }

  /**
   * Clear all records (useful for test isolation).
   */
  public clear(): void {
    this.records = [];
    this.seenRecordIds.clear();
  }
}
