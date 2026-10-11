import { Commodity, PriceTier } from '@genesis/shared';
import { InventoryManager } from '../inventory/InventoryManager';
import { WorldEngine } from '../world/WorldEngine';

export interface CommodityPriceCalculation {
  productId: string;
  regionId: string;
  referencePrice: number;
  retailPrice: number;
  wholesaleUnitPrice: number;
  producerReservationPrice?: number;
  scarcitySurplusFactor: number;
  regionalFactor: number;
  inventoryAvailable: number;
  targetDemand: number;
  productionCostReference?: number;
}

export interface DynamicPricingConfig {
  minPriceMultiplier: number; // e.g. 0.5 (surplus floor)
  maxPriceMultiplier: number; // e.g. 2.5 (scarcity ceiling)
  dampingFactor: number; // smoothing factor (0.1 to 0.3) to avoid tick-to-tick noise
  wholesaleDiscountPercent: number; // e.g. 0.15 (15% wholesale discount)
  producerTargetMarginPercent: number; // e.g. 0.10 (10% target margin over unit production cost)
}

export const DEFAULT_DYNAMIC_PRICING_CONFIG: DynamicPricingConfig = {
  minPriceMultiplier: 0.5,
  maxPriceMultiplier: 2.5,
  dampingFactor: 0.2,
  wholesaleDiscountPercent: 0.15,
  producerTargetMarginPercent: 0.10
};

export class PriceFormationService {
  private config: DynamicPricingConfig;
  private productionCostCalculator?: import('../finance/ProductionCostCalculator').ProductionCostCalculator;

  constructor(
    private worldEngine: WorldEngine,
    private inventoryManager: InventoryManager,
    private getCommodityFn: (productId: string) => Commodity | undefined,
    config?: Partial<DynamicPricingConfig>,
    productionCostCalculator?: import('../finance/ProductionCostCalculator').ProductionCostCalculator
  ) {
    this.config = { ...DEFAULT_DYNAMIC_PRICING_CONFIG, ...config };
    this.productionCostCalculator = productionCostCalculator;
  }

  public setProductionCostCalculator(calc: import('../finance/ProductionCostCalculator').ProductionCostCalculator): void {
    this.productionCostCalculator = calc;
  }

  /**
   * Calculates the authoritative price breakdown for a commodity in a region.
   *
   * @param productId The ID of the commodity (e.g. 'wheat', 'water', 'raw_fish')
   * @param regionId The region where the price applies (e.g. 'DEFAULT' or specific region ID)
   * @param regionalMultiplier Optional external regional factor (defaults to 1.0)
   * @param regionalOffset Optional external regional offset (defaults to 0.0)
   * @param requestedQuantity Optional quantity for tiered bulk price calculation
   * @param customBulkPricing Optional bulk pricing tiers
   */
  public calculatePrice(
    productId: string,
    regionId: string,
    regionalMultiplier: number = 1.0,
    regionalOffset: number = 0.0,
    requestedQuantity: number = 1,
    customBulkPricing?: PriceTier[]
  ): CommodityPriceCalculation {
    const commodity = this.getCommodityFn(productId);
    const referencePrice = commodity?.basePrice ?? 10;

    // 1. Gather sellable inventory in the region
    const { totalAvailable, totalWorkplaceCapacity } = this.getRegionInventoryAndCapacity(productId, regionId);

    // 2. Determine target baseline supply/demand ratio
    // If no workplaces or inventory exist, do not fabricate scarcity or surplus; maintain neutral factor 1.0
    let scarcitySurplusFactor = 1.0;

    if (totalWorkplaceCapacity > 0) {
      // Normal target stock is roughly 50% of workplace storage/capacity quota
      // When availableStock is far below normal, factor > 1 (scarcity).
      // When availableStock is far above normal, factor < 1 (surplus).
      const baselineTargetStock = Math.max(10, totalWorkplaceCapacity * 20); // standard baseline
      const inventoryRatio = totalAvailable / baselineTargetStock;

      // Bound ratio smoothly:
      // If inventoryRatio = 1.0 -> factor = 1.0
      // If inventoryRatio = 0.0 -> factor rises towards maxPriceMultiplier with damping
      // If inventoryRatio = 3.0 -> factor falls towards minPriceMultiplier with damping
      const rawFactor = 1.0 + (1.0 - inventoryRatio) * this.config.dampingFactor;
      scarcitySurplusFactor = Math.min(this.config.maxPriceMultiplier, Math.max(this.config.minPriceMultiplier, rawFactor));
    }

    // 3. Regional adjustment applied exactly once
    const clampedRegionalMultiplier = Math.max(0.5, Math.min(2.0, regionalMultiplier));
    const regionalFactor = clampedRegionalMultiplier;

    // 4. Formulate authoritative retail unit price:
    // retailPrice = max(1, round((referencePrice * scarcitySurplusFactor * regionalFactor) + regionalOffset, 2))
    const calculatedRetail = Math.max(
      1,
      parseFloat(((referencePrice * scarcitySurplusFactor * regionalFactor) + regionalOffset).toFixed(2))
    );

    // 5. Formulate wholesale price:
    // If tiered bulk pricing exists, adjust proportionally or use tiered discount
    let wholesaleUnitPrice = calculatedRetail * (1 - this.config.wholesaleDiscountPercent);

    if (customBulkPricing && customBulkPricing.length > 0) {
      // Find tier for requested quantity
      let tierPrice = customBulkPricing[0].unitPrice;
      for (const tier of customBulkPricing) {
        if (requestedQuantity >= tier.minimumQuantity) {
          tierPrice = tier.unitPrice;
        }
      }
      // Scale tierPrice by the scarcity and regional factor
      wholesaleUnitPrice = Math.max(0.5, parseFloat((tierPrice * scarcitySurplusFactor * regionalFactor).toFixed(2)));
    } else {
      wholesaleUnitPrice = Math.max(0.5, parseFloat(wholesaleUnitPrice.toFixed(2)));
    }

    // 6. Producer reservation price based on real production cost
    let producerReservationPrice: number | undefined = undefined;
    let productionCostReference: number | undefined = undefined;

    const unitProductionCost = this.estimateProducerUnitCost(productId, regionId);
    if (unitProductionCost !== undefined && unitProductionCost > 0) {
      productionCostReference = unitProductionCost;
      // Producer reservation price = unitCost * (1 + targetMargin)
      producerReservationPrice = parseFloat((unitProductionCost * (1 + this.config.producerTargetMarginPercent)).toFixed(2));

      // Wholesale price cannot sell below producer reservation floor
      // without explicit business subsidy/rule
      if (wholesaleUnitPrice < producerReservationPrice) {
        wholesaleUnitPrice = producerReservationPrice;
      }
    }

    return {
      productId,
      regionId,
      referencePrice,
      retailPrice: calculatedRetail,
      wholesaleUnitPrice,
      producerReservationPrice,
      productionCostReference,
      scarcitySurplusFactor: parseFloat(scarcitySurplusFactor.toFixed(3)),
      regionalFactor: parseFloat(regionalFactor.toFixed(3)),
      inventoryAvailable: totalAvailable,
      targetDemand: totalWorkplaceCapacity > 0 ? totalWorkplaceCapacity * 20 : 0
    };
  }

  /**
   * Estimates unit production cost for producers producing this commodity in the region.
   * Pulls real labor and input costs via ProductionCostCalculator.
   */
  public estimateProducerUnitCost(productId: string, regionId: string): number | undefined {
    if (!this.productionCostCalculator) return undefined;

    const workplaces = this.worldEngine.workplaceRepository.findAll();
    const producerTypes = ['FARM', 'MINE', 'FISHING_SITE', 'FOREST_SITE', 'FACTORY'];
    const producers = workplaces.filter(w => {
      const isProducer = producerTypes.includes(w.type);
      const matchesRegion = !regionId || regionId === 'DEFAULT' || w.regionId === regionId;
      return isProducer && matchesRegion;
    });

    if (producers.length === 0) return undefined;

    let totalLaborAndInputCost = 0;
    let sampleCount = 0;

    for (const producer of producers) {
      // Calculate daily cost with current worker occupancy
      const costResult = this.productionCostCalculator.calculateCost(producer.id, {});
      if (costResult && costResult.laborCost > 0) {
        // Daily yield estimation based on capacity
        const estimatedDailyYield = Math.max(10, producer.capacity * 10);
        totalLaborAndInputCost += costResult.totalCost / estimatedDailyYield;
        sampleCount++;
      }
    }

    if (sampleCount === 0) return undefined;
    return parseFloat((totalLaborAndInputCost / sampleCount).toFixed(2));
  }


  /**
   * Evaluates transportation landed cost given base unit price, quantity, and route distance.
   */
  public calculateLandedCost(
    unitPrice: number,
    quantity: number,
    distance: number,
    ratePerUnitDistance: number = 0.1
  ): { goodsCost: number; transportCost: number; totalLandedCost: number; effectiveUnitPrice: number } {
    const goodsCost = parseFloat((unitPrice * quantity).toFixed(2));
    const transportCost = parseFloat((quantity * distance * ratePerUnitDistance).toFixed(2));
    const totalLandedCost = parseFloat((goodsCost + transportCost).toFixed(2));
    const effectiveUnitPrice = quantity > 0 ? parseFloat((totalLandedCost / quantity).toFixed(2)) : unitPrice;

    return {
      goodsCost,
      transportCost,
      totalLandedCost,
      effectiveUnitPrice
    };
  }

  private getRegionInventoryAndCapacity(productId: string, regionId: string): { totalAvailable: number; totalWorkplaceCapacity: number } {
    const workplaces = this.worldEngine.workplaceRepository.findAll();
    const regionWorkplaces = regionId && regionId !== 'DEFAULT'
      ? workplaces.filter(w => w.regionId === regionId)
      : workplaces;

    let totalAvailable = 0;
    let totalWorkplaceCapacity = 0;

    for (const wp of regionWorkplaces) {
      if (['SHOP', 'RETAIL', 'BUSINESS', 'WHOLESALE'].includes(wp.type)) {
        totalWorkplaceCapacity += wp.capacity || 10;
        if (wp.inventoryId) {
          const inv = this.inventoryManager.getInventory(wp.inventoryId);
          if (inv && inv.items[productId]) {
            const item = inv.items[productId];
            totalAvailable += Math.max(0, item.totalQuantity - (item.reservedQuantity || 0));
          }
        }
      }
    }

    return { totalAvailable, totalWorkplaceCapacity };
  }
}
