import { ProductionDefinition } from '@genesis/shared';
import { ResourceManager } from './ResourceManager';
import { randomUUID } from 'crypto';

export interface ResourceAllocation {
  allocationId: string;
  regionId: string;
  workplaceId: string;
  actualProduction: number;
  consumedResources: { resourceType: string; amount: number; unit: string }[];
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

  private getAggregatedResource(regionId: string, type: string) {
    const resources = this.resourceManager.getResourcesByRegion(regionId);
    let totalAvailable = 0;
    let regionalReserved = 0;
    let unit = '';

    for (const res of resources) {
      if (res.type === type) {
        totalAvailable += res.currentAmount;
        regionalReserved += res.reservedAmount || 0;
        unit = res.unit;
      }
    }
    return { totalAvailable, regionalReserved, unit };
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
      const agg = this.getAggregatedResource(regionId, req.resourceId);
      
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

    return maxFeasibleOutput;
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
      const agg = this.getAggregatedResource(regionId, req.resourceId);

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
      const resources = this.resourceManager.getResourcesByRegion(allocation.regionId)
        .filter(r => r.type === consumed.resourceType);

      let remainingToDeduct = consumed.amount;

      for (const res of resources) {
        if (remainingToDeduct <= 0) break;

        const deduct = Math.min(res.currentAmount, remainingToDeduct);
        const updates = { currentAmount: res.currentAmount - deduct };
        this.resourceManager.updateResource(allocation.regionId, res.id, updates);
        remainingToDeduct -= deduct;
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
            if (res.resourceType === resourceType) {
               pendingConsumed += res.amount;
            }
         }
      }
    }

    return Math.max(0, agg.totalAvailable - agg.regionalReserved - totalProducerReserved - pendingConsumed);
  }
}
