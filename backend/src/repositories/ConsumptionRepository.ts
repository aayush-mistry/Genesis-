import { prisma } from './prisma';

export interface ConsumptionRecordCreateData {
  eventId: string;
  timestamp: number;
  simulationDay?: number;
  simulationHour?: number;
  consumerId?: string;
  householdId?: string;
  sourceInventoryId?: string;
  commodityId: string;
  quantity: number;
  unit: string;
  context: string;
  worldId?: string;
  regionId?: string;
}

export interface ConsumptionHistoryFilter {
  commodityId?: string;
  regionId?: string;
  fromTimestamp?: number;
  toTimestamp?: number;
  limit?: number;
}

export class ConsumptionRepository {
  /**
   * Persists a consumption event into the durable ledger.
   * Catches unique constraint violations (P2002) for idempotent retries.
   */
  async recordConsumption(data: ConsumptionRecordCreateData) {
    if (data.quantity <= 0) {
      return null;
    }

    try {
      return await prisma.consumptionRecord.create({
        data: {
          eventId: data.eventId,
          timestamp: data.timestamp,
          simulationDay: data.simulationDay,
          simulationHour: data.simulationHour,
          consumerId: data.consumerId,
          householdId: data.householdId,
          sourceInventoryId: data.sourceInventoryId,
          commodityId: data.commodityId,
          quantity: data.quantity,
          unit: data.unit,
          context: data.context,
          worldId: data.worldId,
          regionId: data.regionId
        }
      });
    } catch (error: any) {
      if (error.code === 'P2002') {
        // Idempotency: Event already recorded, fetch and return existing record
        return await prisma.consumptionRecord.findUnique({
          where: { eventId: data.eventId }
        });
      }
      throw error;
    }
  }

  /**
   * Queries consumption history with optional filtering.
   */
  async findHistory(filter: ConsumptionHistoryFilter = {}) {
    const where: any = {};

    if (filter.commodityId) where.commodityId = filter.commodityId;
    if (filter.regionId) where.regionId = filter.regionId;

    if (filter.fromTimestamp !== undefined || filter.toTimestamp !== undefined) {
      where.timestamp = {};
      if (filter.fromTimestamp !== undefined) where.timestamp.gte = filter.fromTimestamp;
      if (filter.toTimestamp !== undefined) where.timestamp.lte = filter.toTimestamp;
    }

    return await prisma.consumptionRecord.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: filter.limit ?? 100
    });
  }

  /**
   * Aggregates total consumption for a commodity/region in a time window.
   */
  async getAggregate(commodityId: string, regionId?: string, fromTimestamp?: number, toTimestamp?: number) {
    const where: any = { commodityId };

    if (regionId) where.regionId = regionId;

    if (fromTimestamp !== undefined || toTimestamp !== undefined) {
      where.timestamp = {};
      if (fromTimestamp !== undefined) where.timestamp.gte = fromTimestamp;
      if (toTimestamp !== undefined) where.timestamp.lte = toTimestamp;
    }

    const agg = await prisma.consumptionRecord.aggregate({
      where,
      _sum: { quantity: true },
      _count: true,
      _min: { timestamp: true },
      _max: { timestamp: true }
    });

    return {
      totalQuantity: agg._sum.quantity || 0,
      count: agg._count || 0,
      earliestTimestamp: agg._min.timestamp,
      latestTimestamp: agg._max.timestamp
    };
  }

  /**
   * Clear all records (for isolated test teardowns).
   */
  async clearAll() {
    return await prisma.consumptionRecord.deleteMany();
  }
}

export const consumptionRepository = new ConsumptionRepository();
