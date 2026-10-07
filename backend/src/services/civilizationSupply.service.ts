import { prisma } from '../repositories/prisma';
import { supplyService } from './supply.service';
import { timeService } from './time.service';

export interface CommoditySupply {
  unit: string;
  retailSupply: number;
  wholesaleSupply: number;
  producerSupply: number;
  inTransitSupply: number;
  totalAvailable: number; // Sum of retail + wholesale + producer + inTransit
  productionCapacity: number; // Max daily production capacity
}

export interface CivilizationSupplyIntelligence {
  timestamp: number;
  food: CommoditySupply;
  water: CommoditySupply;
}

export class CivilizationSupplyService {
  public async getSupplyIntelligence(): Promise<CivilizationSupplyIntelligence> {
    // 1. Get food and water commodities from the authoritative supplyService
    const foodProductIds: string[] = [];
    const waterProductIds: string[] = [];

    for (const commodity of supplyService.productionEngine.commodities.values()) {
      if (commodity.category === 'FOOD') {
        if (commodity.id === 'water') {
          waterProductIds.push(commodity.id);
        } else {
          foodProductIds.push(commodity.id);
        }
      }
    }

    // 2. Fetch inventory items joined with Workplace to separate by supply chain stage
    const inventoryItems = await prisma.inventoryItem.findMany({
      include: {
        inventory: {
          select: { ownerId: true }
        }
      }
    });

    const workplaces = await prisma.workplace.findMany({
      select: { id: true, type: true, capacity: true, occupiedPositions: true }
    });

    const workplaceTypeMap = new Map<string, string>();
    const workplaceCapacityMap = new Map<string, number>();
    const workplaceOccupancyMap = new Map<string, number>();

    for (const wp of workplaces) {
      workplaceTypeMap.set(wp.id, wp.type);
      workplaceCapacityMap.set(wp.id, wp.capacity);
      workplaceOccupancyMap.set(wp.id, wp.occupiedPositions);
    }

    // Accumulators
    let foodRetail = 0;
    let foodWholesale = 0;
    let foodProducer = 0;

    let waterRetail = 0;
    let waterWholesale = 0;
    let waterProducer = 0;

    for (const item of inventoryItems) {
      const isFood = foodProductIds.includes(item.productId);
      const isWater = waterProductIds.includes(item.productId);
      
      if (!isFood && !isWater) continue;

      const wpType = workplaceTypeMap.get(item.inventory.ownerId);
      if (!wpType) continue; // Might belong to a household, skip for available supply for now

      if (['SHOP', 'BUSINESS', 'RETAIL'].includes(wpType)) {
        if (isFood) foodRetail += item.totalQuantity;
        if (isWater) waterRetail += item.totalQuantity;
      } else if (wpType === 'WHOLESALE') {
        if (isFood) foodWholesale += item.totalQuantity;
        if (isWater) waterWholesale += item.totalQuantity;
      } else if (['FARM', 'MINE', 'FISHING_SITE', 'FOREST_SITE', 'FACTORY'].includes(wpType)) {
        if (isFood) foodProducer += item.totalQuantity;
        if (isWater) waterProducer += item.totalQuantity;
      }
    }

    // 3. Fetch in-transit shipments
    const shipments = await prisma.shipment.findMany({
      where: { status: 'IN_TRANSIT' },
      select: { productId: true, quantity: true }
    });

    let foodInTransit = 0;
    let waterInTransit = 0;

    for (const shipment of shipments) {
      if (foodProductIds.includes(shipment.productId)) {
        foodInTransit += shipment.quantity;
      } else if (waterProductIds.includes(shipment.productId)) {
        waterInTransit += shipment.quantity;
      }
    }

    // 4. Calculate Production Capacity
    let foodProductionCapacity = 0;
    let waterProductionCapacity = 0;

    for (const wp of workplaces) {
      if (!['FARM', 'MINE', 'FISHING_SITE', 'FOREST_SITE', 'FACTORY'].includes(wp.type)) continue;

      // Determine product
      let producedProductId: string | null = null;
      for (const def of supplyService.productionEngine.productionDefinitions.values()) {
        if (def.workplaceType === wp.type) {
          producedProductId = def.productId;
          break;
        }
      }

      if (!producedProductId) continue;

      const isFood = foodProductIds.includes(producedProductId);
      const isWater = waterProductIds.includes(producedProductId);

      if (!isFood && !isWater) continue;

      const def = supplyService.productionEngine.productionDefinitions.get(producedProductId);
      if (!def) continue;

      // From ProductionEngine: baseCapacity = (workplace.capacity / definition.workersRequiredPerUnitArea) * definition.baseYieldPerArea;
      const baseCapacity = (wp.capacity / def.workersRequiredPerUnitArea) * def.baseYieldPerArea;
      // Note: we are calculating maximum capacity based on worker occupancy to reflect real potential today
      const workerEfficiency = wp.capacity > 0 ? (wp.occupiedPositions / wp.capacity) : 0;
      const actualCapacity = baseCapacity * workerEfficiency;

      if (isFood) foodProductionCapacity += actualCapacity;
      if (isWater) waterProductionCapacity += actualCapacity;
    }

    return {
      timestamp: timeService.engine.getCurrentTime().year, // just a placeholder marker
      food: {
        unit: 'kg',
        retailSupply: foodRetail,
        wholesaleSupply: foodWholesale,
        producerSupply: foodProducer,
        inTransitSupply: foodInTransit,
        totalAvailable: foodRetail + foodWholesale + foodProducer + foodInTransit,
        productionCapacity: foodProductionCapacity
      },
      water: {
        unit: 'L',
        retailSupply: waterRetail,
        wholesaleSupply: waterWholesale,
        producerSupply: waterProducer,
        inTransitSupply: waterInTransit,
        totalAvailable: waterRetail + waterWholesale + waterProducer + waterInTransit,
        productionCapacity: waterProductionCapacity
      }
    };
  }
}

export const civilizationSupplyService = new CivilizationSupplyService();
