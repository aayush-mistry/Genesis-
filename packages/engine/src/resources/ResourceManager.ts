import { Resource, ResourceType, ResourceCategory, ResourceStatistics } from '@genesis/shared';
import { randomUUID } from 'crypto';

export class ResourceManager {
  // Map of regionId -> Resource[]
  private resourcesByRegion: Map<string, Resource[]> = new Map();

  public addResource(resourceData: Omit<Resource, 'id' | 'createdAt' | 'updatedAt'>): Resource {
    const resource: Resource = {
      ...resourceData,
      id: randomUUID(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    if (!this.resourcesByRegion.has(resource.regionId)) {
      this.resourcesByRegion.set(resource.regionId, []);
    }
    
    this.resourcesByRegion.get(resource.regionId)!.push(resource);
    return resource;
  }

  public getResourcesByRegion(regionId: string): Resource[] {
    return this.resourcesByRegion.get(regionId) || [];
  }

  public getResourceById(regionId: string, resourceId: string): Resource | undefined {
    const resources = this.getResourcesByRegion(regionId);
    return resources.find(r => r.id === resourceId);
  }

  public updateResource(regionId: string, resourceId: string, updates: Partial<Omit<Resource, 'id' | 'regionId'>>): Resource | undefined {
    const resources = this.resourcesByRegion.get(regionId);
    if (!resources) return undefined;

    const index = resources.findIndex(r => r.id === resourceId);
    if (index === -1) return undefined;

    const updatedResource = { 
      ...resources[index], 
      ...updates,
      updatedAt: new Date()
    };
    
    resources[index] = updatedResource;
    return updatedResource;
  }

  public deleteResourcesForRegion(regionId: string): void {
    this.resourcesByRegion.delete(regionId);
  }

  public getAllResources(): Resource[] {
    return Array.from(this.resourcesByRegion.values()).flat();
  }

  public getStatistics(): ResourceStatistics {
    const all = this.getAllResources();
    let totalQuantity = 0;
    let totalCondition = 0;
    let renewableQuantity = 0;
    let nonRenewableQuantity = 0;
    let totalRegenerationRate = 0;
    let resourcesWithCondition = 0;
    let resourcesWithRegeneration = 0;
    const distribution: Record<string, number> = {};

    all.forEach(r => {
      totalQuantity += r.currentAmount;
      if (r.condition !== null) {
        totalCondition += r.condition.value;
        resourcesWithCondition++;
      }
      if (r.naturalRecoveryRate !== null) {
        totalRegenerationRate += r.naturalRecoveryRate;
        resourcesWithRegeneration++;
      }

      if (r.renewable) {
        renewableQuantity += r.currentAmount;
      } else {
        nonRenewableQuantity += r.currentAmount;
      }

      distribution[r.type] = (distribution[r.type] || 0) + r.currentAmount;
    });

    const count = all.length;

    return {
      totalQuantity,
      averageCondition: resourcesWithCondition > 0 ? totalCondition / resourcesWithCondition : 0,
      renewableQuantity,
      nonRenewableQuantity,
      resourceDistribution: distribution,
      averageRegenerationRate: resourcesWithRegeneration > 0 ? totalRegenerationRate / resourcesWithRegeneration : 0
    };
  }
}
