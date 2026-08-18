import { Coordinate, SpatialEntity, SpatialQueryOptions, SpatialRelationship } from '@genesis/shared';
import { SpatialIndex } from './SpatialIndex';
import { SpatialCalculator } from './SpatialCalculator';
import { WorldEngine } from '../world/WorldEngine';

export class SpatialQueryService {
  constructor(private index: SpatialIndex, private worldEngine: WorldEngine) {}

  public findNearby(position: Coordinate, radius: number, options?: SpatialQueryOptions): (SpatialEntity & { distance: number })[] {
    let entities = this.index.queryRadius(position, radius);

    if (options?.type) {
      entities = entities.filter(e => e.type === options.type);
    }

    const results = entities.map(entity => ({
      ...entity,
      distance: SpatialCalculator.calculateDistance(entity.position, position),
    }));

    // Sort by distance ascending
    results.sort((a, b) => a.distance - b.distance);

    if (options?.limit) {
      return results.slice(0, options.limit);
    }

    return results;
  }

  public findNearest(position: Coordinate, type?: string): (SpatialEntity & { distance: number }) | null {
    let radius = 100;
    const maxRadius = 10000;
    
    while (radius <= maxRadius) {
      const candidates = this.findNearby(position, radius, { type });
      if (candidates.length > 0) {
        return candidates[0]; // Already sorted by findNearby
      }
      radius *= 2;
    }
    
    return null;
  }

  public findEntitiesInRegion(regionId: string, options?: SpatialQueryOptions): SpatialEntity[] {
    // Spatial index could return all entities, and we filter by regionId
    // Alternatively, if we need to strictly use WorldEngine for "which entities are in this region":
    const region = this.worldEngine.regionManager.getRegion(regionId);
    if (!region) return [];

    const entities: SpatialEntity[] = [];

    // Cities
    region.cityIds.forEach(cityId => {
      const city = this.worldEngine.cityManager.getCity(cityId);
      if (city) {
        entities.push({
          id: city.id,
          type: 'CITY',
          position: city.coordinates,
          regionId: city.regionId,
          metadata: { name: city.name }
        });

        // Districts (Usually districts don't have distinct coordinates in this model, they are logic groups)
        // If they did, we would add them here.

        // Buildings
        city.districtIds.forEach(distId => {
          const district = this.worldEngine.districtManager.getDistrict(distId);
          if (district) {
            district.buildingIds.forEach(bId => {
              const building = this.worldEngine.buildingManager.getBuilding(bId);
              if (building) {
                entities.push({
                  id: building.id,
                  type: 'BUILDING',
                  position: building.coordinates,
                  regionId: city.regionId,
                  metadata: { name: building.name, type: building.type }
                });
              }
            });
          }
        });
      }
    });

    if (options?.type) {
      return entities.filter(e => e.type === options.type);
    }

    return entities;
  }

  public isInsideRegion(entityId: string, regionId: string): boolean {
    const region = this.worldEngine.regionManager.getRegion(regionId);
    if (!region) return false;

    // Check if the entity is a city in this region
    if (region.cityIds.includes(entityId)) return true;

    // Check if the entity is a building inside this region
    for (const cityId of region.cityIds) {
      const city = this.worldEngine.cityManager.getCity(cityId);
      if (!city) continue;
      
      for (const distId of city.districtIds) {
        const district = this.worldEngine.districtManager.getDistrict(distId);
        if (!district) continue;
        
        if (district.buildingIds.includes(entityId)) {
          return true;
        }
      }
    }
    
    return false;
  }

  public getRelationship(entity1: SpatialEntity, entity2: SpatialEntity): SpatialRelationship {
    if (entity1.regionId && entity2.regionId && entity1.regionId === entity2.regionId) {
      return SpatialRelationship.SAME_REGION;
    }
    
    const distance = SpatialCalculator.calculateDistance(entity1.position, entity2.position);
    if (distance <= 100) { // arbitrary NEAR threshold
      return SpatialRelationship.NEAR;
    }
    
    return SpatialRelationship.FAR;
  }

  /**
   * Calculates a simple route between two entities.
   * For Phase 3.4, this returns a straight-line path and the exact Euclidean distance.
   */
  public calculateRoute(sourceId: string, destinationId: string): { path: string[], distance: number } {
    const sourceCoords = this.worldEngine.getEntityCoordinates(sourceId);
    const destCoords = this.worldEngine.getEntityCoordinates(destinationId);

    if (!sourceCoords) {
      throw new Error(`Route generation failed: Source entity ${sourceId} coordinates not found.`);
    }

    if (!destCoords) {
      throw new Error(`Route generation failed: Destination entity ${destinationId} coordinates not found.`);
    }

    const distance = SpatialCalculator.calculateDistance(sourceCoords, destCoords);
    return {
      path: [sourceId, destinationId],
      distance
    };
  }
}
