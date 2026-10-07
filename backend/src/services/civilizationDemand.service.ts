import { prisma } from '../repositories/prisma';
import { supplyService } from './supply.service';
import { ProductCategory } from '@genesis/shared';
import { timeService } from './time.service';

export class CivilizationDemandService {
  /**
   * Retrieves authoritative demand intelligence based on actual citizen state and transactions.
   */
  public async getDemandIntelligence() {
    const currentTime = timeService.engine.getCurrentTime();
    
    // Categorize commodities
    const foodCommodities = new Map<string, any>();
    const waterCommodities = new Map<string, any>();
    
    for (const commodity of supplyService.productionEngine.commodities.values()) {
      if (commodity.category === ProductCategory.FOOD) {
        if (commodity.id === 'water') {
          waterCommodities.set(commodity.id, commodity);
        } else {
          foodCommodities.set(commodity.id, commodity);
        }
      }
    }

    const foodProductIds = Array.from(foodCommodities.keys());
    const waterProductIds = Array.from(waterCommodities.keys());

    // 1. Calculate Current Unmet Need from Authoritative Citizen State
    const citizens = await prisma.citizen.findMany({ select: { vitalStateJson: true } });
    
    let totalUnmetHunger = 0;
    let totalUnmetThirst = 0;

    for (const c of citizens) {
      if (c.vitalStateJson) {
        try {
          const vitals = JSON.parse(c.vitalStateJson);
          // Target value is 20 for hunger and thirst (from ConsumptionEngine)
          if (vitals.hunger > 20) totalUnmetHunger += (vitals.hunger - 20);
          if (vitals.thirst > 20) totalUnmetThirst += (vitals.thirst - 20);
        } catch (e) {}
      }
    }

    // Convert restoration points to equivalent kg/L based on a primary commodity (e.g. wheat for food, water for water)
    const primaryFood = foodCommodities.get('wheat');
    const foodRestorationValue = primaryFood?.consumable?.restorationValue || 20; // fallback to 20
    const currentFoodUnmetKg = totalUnmetHunger / foodRestorationValue;

    const primaryWater = waterCommodities.get('water');
    const waterRestorationValue = primaryWater?.consumable?.restorationValue || 25; // fallback to 25
    const currentWaterUnmetL = totalUnmetThirst / waterRestorationValue;

    // 2. Calculate Purchased quantities from authoritative TransactionRecords
    // Define the time window: We will use all-time for simplicity, or last 24h if we calculate timestamp.
    // TimeEngine stores timestamps in seconds. Let's get the last 24 hours.
    // Assuming TimeUtils is on timeService.engine.TimeUtils
    let last24hSeconds = 0;
    try {
      const { TimeUtils } = require('@genesis/engine');
      const currentSeconds = TimeUtils.toSeconds(currentTime);
      const secondsInDay = 24 * 60 * 60;
      last24hSeconds = Math.max(0, currentSeconds - secondsInDay);
    } catch(e) {
       // fallback if TimeUtils requires import mapping differently
    }

    const recentTransactions = await prisma.transactionRecord.findMany({
      where: {
        transactionType: 'PURCHASE',
        timestamp: { gte: last24hSeconds }
      },
      select: { productId: true, quantity: true, unit: true }
    });

    let purchasedFoodKg = 0;
    let purchasedWaterL = 0;

    for (const tx of recentTransactions) {
      if (tx.productId && tx.quantity) {
        if (foodProductIds.includes(tx.productId)) {
          // Assuming all food is in kg as per domain
          purchasedFoodKg += tx.quantity;
        } else if (waterProductIds.includes(tx.productId)) {
          purchasedWaterL += tx.quantity;
        }
      }
    }

    // 3. We cannot calculate "consumed" because consumption events are not persisted in Prisma.
    // It would require scanning system logs or adding a new model, which is out of scope for T7.8.1 aggregation.
    
    return {
      period: 'last_24_hours',
      food: {
        unit: 'kg',
        demand: 'unavailable', // Need historical data to see full daily demand accurately
        consumed: 'unavailable',
        purchased: purchasedFoodKg,
        unmet: Math.ceil(currentFoodUnmetKg) // Expressed in equivalent kg of primary food
      },
      water: {
        unit: 'L',
        demand: 'unavailable',
        consumed: 'unavailable',
        purchased: purchasedWaterL,
        unmet: Math.ceil(currentWaterUnmetL)
      }
    };
  }
}

export const civilizationDemandService = new CivilizationDemandService();
