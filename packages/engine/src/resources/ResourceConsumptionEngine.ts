import { ProductionDefinition, ResourceType } from '@genesis/shared';
import { ResourceManager } from './ResourceManager';
import { randomUUID } from 'crypto';

export interface ResourceAllocation {
  allocationId: string;
  regionId: string;
  workplaceId: string;
  actualProduction: number;
  consumedResources: { resourceType: string; amount: number; unit: string }[];
}

export interface DomesticWaterExtractionResult {
  success: boolean;
  requestedLitres: number;
  extractedLitres: number;
  extractedM3: number;
  remainingRegionalWaterM3: number;
  failureReason?: string;
}

export class ResourceConsumptionEngine {
  // In-memory mapping of workplaceId -> { resourceType -> reservedAmount }
  private producerReserves: Map<string, Record<string, number>> = new Map();
  // Pending allocations waiting to be confirmed/consumed
  private pendingAllocations: Map<string, ResourceAllocation> = new Map();

  constructor(private resourceManager: ResourceManager) {}

  public setProducerReserve(workplaceId: string, resourceType: string, amount: number): void {
    let reserves = this.producerReserves.get(workplaceId);
    if (!reserves) {
      reserves = {};
      this.producerReserves.set(workplaceId, reserves);
    }
    reserves[resourceType] = amount;
  }

  public calculateRequirements(
    definition: ProductionDefinition,
    requestedOutput: number,
    environmentalModifier: number = 1.0
  ): { resourceType: string; requiredAmount: number }[] {
    if (!definition.resourceRequirements) return [];

    return definition.resourceRequirements.map(req => ({
      resourceType: req.resourceId,
      requiredAmount: (req.amountPerOutputUnit * requestedOutput) * environmentalModifier
    }));
  }

  private isWaterResource(type: string): boolean {
    return type === 'WATER' || type === (ResourceType.WATER as any);
  }

  private getWaterUnitMultiplier(unit?: string): number {
    if (!unit) return 1.0;
    const u = unit.trim().toLowerCase();
    if (u === 'm³' || u === 'm3' || u === 'cubic_meter' || u === 'cubic_meters') {
      return 1000.0;
    }
    return 1.0;
  }

  private getAggregatedResource(regionId: string, type: string) {
    const resources = this.resourceManager.getResourcesByRegion(regionId);
    let totalAvailable = 0;
    let regionalReserved = 0;
    let unit = '';
    const isWater = this.isWaterResource(type);
    let resourceCount = 0;

    for (const res of resources) {
      if (res.type === type || (isWater && (res.type as string).toUpperCase() === 'WATER')) {
        resourceCount++;
        const multiplier = isWater ? this.getWaterUnitMultiplier(res.unit) : 1.0;
        totalAvailable += res.currentAmount * multiplier;
        regionalReserved += (res.reservedAmount || 0) * multiplier;
        unit = isWater ? 'L' : res.unit;
      }
    }
    return { totalAvailable, regionalReserved, unit, resourceCount };
  }

  public calculateMaximumProduction(
    definition: ProductionDefinition,
    requestedOutput: number,
    workplaceId: string,
    regionId: string,
    environmentalModifier: number = 1.0
  ): number {
    if (!definition.resourceRequirements || definition.resourceRequirements.length === 0) {
      return requestedOutput;
    }

    let maxFeasibleOutput = requestedOutput;

    for (const req of definition.resourceRequirements) {
      const isWater = this.isWaterResource(req.resourceId);
      const agg = this.getAggregatedResource(regionId, req.resourceId);

      // Preserve documented neutral fallback when local water data is unavailable
      if (isWater && agg.resourceCount === 0) {
        continue;
      }
      
      const producerReserves = this.producerReserves.get(workplaceId) || {};
      const producerReserved = producerReserves[req.resourceId] || 0;

      const availableForProduction = Math.max(0, agg.totalAvailable - agg.regionalReserved - producerReserved);
      const requiredPerUnit = req.amountPerOutputUnit * environmentalModifier;
      
      if (requiredPerUnit <= 0) continue;

      const feasibleFromThisResource = availableForProduction / requiredPerUnit;
      
      if (feasibleFromThisResource < maxFeasibleOutput) {
        maxFeasibleOutput = feasibleFromThisResource;
      }
    }

    return Math.max(0, maxFeasibleOutput);
  }

  public allocateResources(
    definition: ProductionDefinition,
    actualProduction: number,
    workplaceId: string,
    regionId: string,
    environmentalModifier: number = 1.0
  ): ResourceAllocation | null {
    if (actualProduction <= 0) return null;
    if (!definition.resourceRequirements || definition.resourceRequirements.length === 0) {
      return {
        allocationId: randomUUID(),
        regionId,
        workplaceId,
        actualProduction,
        consumedResources: []
      };
    }

    const consumedResources: { resourceType: string; amount: number; unit: string }[] = [];

    for (const req of definition.resourceRequirements) {
      const isWater = this.isWaterResource(req.resourceId);
      const agg = this.getAggregatedResource(regionId, req.resourceId);

      // Preserve documented neutral fallback when local water data is unavailable
      if (isWater && agg.resourceCount === 0) {
        continue;
      }

      const producerReserves = this.producerReserves.get(workplaceId) || {};
      const producerReserved = producerReserves[req.resourceId] || 0;

      const availableForProduction = Math.max(0, agg.totalAvailable - agg.regionalReserved - producerReserved);
      const requiredAmount = (req.amountPerOutputUnit * actualProduction) * environmentalModifier;

      if (availableForProduction < requiredAmount) {
        return null;
      }

      consumedResources.push({
        resourceType: req.resourceId,
        amount: requiredAmount,
        unit: agg.unit
      });
    }

    const allocationId = randomUUID();
    const allocation: ResourceAllocation = {
      allocationId,
      regionId,
      workplaceId,
      actualProduction,
      consumedResources
    };

    this.pendingAllocations.set(allocationId, allocation);
    return allocation;
  }

  public consumeResources(allocationId: string): boolean {
    const allocation = this.pendingAllocations.get(allocationId);
    if (!allocation) return false;

    for (const consumed of allocation.consumedResources) {
      const isWater = this.isWaterResource(consumed.resourceType);
      const resources = this.resourceManager.getResourcesByRegion(allocation.regionId)
        .filter(r => r.type === consumed.resourceType || (isWater && (r.type as string).toUpperCase() === 'WATER'));

      let remainingToDeduct = consumed.amount;

      for (const res of resources) {
        if (remainingToDeduct <= 0) break;

        if (isWater) {
          const mult = this.getWaterUnitMultiplier(res.unit);
          // res.currentAmount * mult is in Litres. consumed.amount is in Litres.
          const availableInLitres = res.currentAmount * mult;
          const deductInLitres = Math.min(availableInLitres, remainingToDeduct);
          const deductInResourceUnits = deductInLitres / mult;
          const newAmount = Math.max(0, res.currentAmount - deductInResourceUnits);
          this.resourceManager.updateResource(allocation.regionId, res.id, { currentAmount: newAmount });
          remainingToDeduct -= deductInLitres;
        } else {
          const deduct = Math.min(res.currentAmount, remainingToDeduct);
          const updates = { currentAmount: Math.max(0, res.currentAmount - deduct) };
          this.resourceManager.updateResource(allocation.regionId, res.id, updates);
          remainingToDeduct -= deduct;
        }
      }
    }

    this.pendingAllocations.delete(allocationId);
    return true;
  }

  public releaseReservation(allocationId: string): void {
    this.pendingAllocations.delete(allocationId);
  }

  public getExportableSurplus(regionId: string, resourceType: string): number {
    const agg = this.getAggregatedResource(regionId, resourceType);
    const isWater = this.isWaterResource(resourceType);
    
    let totalProducerReserved = 0;
    for (const reserves of this.producerReserves.values()) {
      if (reserves[resourceType]) {
        totalProducerReserved += reserves[resourceType];
      }
    }

    let pendingConsumed = 0;
    for (const alloc of this.pendingAllocations.values()) {
      if (alloc.regionId === regionId) {
         for (const res of alloc.consumedResources) {
            if (res.resourceType === resourceType || (isWater && this.isWaterResource(res.resourceType))) {
               pendingConsumed += res.amount;
            }
         }
      }
    }

    return Math.max(0, agg.totalAvailable - agg.regionalReserved - totalProducerReserved - pendingConsumed);
  }

  /**
   * Directly extracts domestic water in Litres from canonical regional water resources.
   * Converts exactly 1 m³ = 1,000 Litres (0.001 m³ per Litre).
   * Physical water is deducted directly from ResourceManager, ensuring conservation
   * and preventing negative stocks or duplicate extraction.
   */
  public extractDomesticWater(regionId: string, requestedLitres: number): DomesticWaterExtractionResult {
    if (requestedLitres <= 0) {
      return {
        success: false,
        requestedLitres,
        extractedLitres: 0,
        extractedM3: 0,
        remainingRegionalWaterM3: 0,
        failureReason: 'INVALID_QUANTITY'
      };
    }

    const resources = this.resourceManager.getResourcesByRegion(regionId)
      .filter(r => this.isWaterResource(r.type));

    if (resources.length === 0) {
      return {
        success: false,
        requestedLitres,
        extractedLitres: 0,
        extractedM3: 0,
        remainingRegionalWaterM3: 0,
        failureReason: 'NO_WATER_RESOURCE'
      };
    }

    // Compute total physically available unreserved water in Litres
    let totalAvailableLitres = 0;
    for (const res of resources) {
      const mult = this.getWaterUnitMultiplier(res.unit);
      const unreservedM3 = Math.max(0, res.currentAmount - (res.reservedAmount || 0));
      totalAvailableLitres += unreservedM3 * mult;
    }

    if (totalAvailableLitres <= 0) {
      let remainingM3 = 0;
      for (const res of resources) remainingM3 += res.currentAmount;
      return {
        success: false,
        requestedLitres,
        extractedLitres: 0,
        extractedM3: 0,
        remainingRegionalWaterM3: remainingM3,
        failureReason: 'DEPLETED_RESERVOIR'
      };
    }

    const litresToExtract = Math.min(requestedLitres, totalAvailableLitres);
    let remainingToDeduct = litresToExtract;

    for (const res of resources) {
      if (remainingToDeduct <= 0) break;
      const mult = this.getWaterUnitMultiplier(res.unit);
      const unreservedM3 = Math.max(0, res.currentAmount - (res.reservedAmount || 0));
      const availableLitres = unreservedM3 * mult;
      if (availableLitres <= 0) continue;

      const deductLitres = Math.min(availableLitres, remainingToDeduct);
      const deductM3 = deductLitres / mult; // 1 m³ = 1000 L
      const newAmount = Math.max(0, res.currentAmount - deductM3);

      this.resourceManager.updateResource(regionId, res.id, {
        currentAmount: Number(newAmount.toFixed(6))
      });
      remainingToDeduct -= deductLitres;
    }

    const actuallyExtractedLitres = litresToExtract - remainingToDeduct;
    const actuallyExtractedM3 = Number((actuallyExtractedLitres / 1000.0).toFixed(6));

    let remainingTotalM3 = 0;
    for (const res of this.resourceManager.getResourcesByRegion(regionId).filter(r => this.isWaterResource(r.type))) {
      remainingTotalM3 += res.currentAmount;
    }

    return {
      success: actuallyExtractedLitres > 0,
      requestedLitres,
      extractedLitres: actuallyExtractedLitres,
      extractedM3: actuallyExtractedM3,
      remainingRegionalWaterM3: Number(remainingTotalM3.toFixed(6))
    };
  }

  /**
   * Compensating rollback: refunds extracted domestic water back to the regional water resource.
   * Used if a multi-step economic transaction or downstream operation fails.
   */
  public refundDomesticWater(regionId: string, litresToRefund: number): void {
    if (litresToRefund <= 0) return;
    const resources = this.resourceManager.getResourcesByRegion(regionId)
      .filter(r => this.isWaterResource(r.type));
    if (resources.length === 0) return;

    let remainingLitres = litresToRefund;
    for (const res of resources) {
      if (remainingLitres <= 0) break;
      const mult = this.getWaterUnitMultiplier(res.unit);
      const capacityM3 = Math.max(0, res.maximumAmount - res.currentAmount);
      const capacityLitres = capacityM3 * mult;
      const refundLitres = Math.min(capacityLitres, remainingLitres);
      const refundM3 = refundLitres / mult;
      const newAmount = Math.min(res.maximumAmount, res.currentAmount + refundM3);

      this.resourceManager.updateResource(regionId, res.id, {
        currentAmount: Number(newAmount.toFixed(6))
      });
      remainingLitres -= refundLitres;
    }
  }
}
