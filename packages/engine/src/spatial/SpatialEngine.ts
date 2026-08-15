import { SpatialEntity } from '@genesis/shared';
import { SpatialIndex } from './SpatialIndex';
import { GridSpatialIndex } from './GridSpatialIndex';
import { SpatialQueryService } from './SpatialQueryService';
import { WorldEngine } from '../world/WorldEngine';
import { EventScheduler } from '../events/EventScheduler';

export class SpatialEngine {
  public index: SpatialIndex;
  public queryService: SpatialQueryService;
  private worldEngine: WorldEngine;
  private scheduler: EventScheduler;

  constructor(worldEngine: WorldEngine, scheduler: EventScheduler, cellSize: number = 100) {
    this.worldEngine = worldEngine;
    this.scheduler = scheduler;
    this.index = new GridSpatialIndex(cellSize);
    this.queryService = new SpatialQueryService(this.index, this.worldEngine);
  }

  public initialize(): void {
    // In a real application, we would subscribe to EventScheduler events here
    // e.g., this.scheduler.emitter.on('ENTITY_CREATED', this.handleEntityCreated.bind(this));
    // For now, we populate the initial world state into the spatial index.
    this.populateInitialState();
  }

  private populateInitialState(): void {
    this.index.clear();

    const regions = this.worldEngine.regionManager.getAllRegions();
    for (const region of regions) {
      // Index the region itself if we treat regions as spatial entities?
      // Typically regions are bounds, but they have a coordinate center in this engine.
      this.registerEntity({
        id: region.id,
        type: 'REGION',
        position: region.coordinates,
        regionId: region.id, // itself
        metadata: { name: region.name }
      });

      for (const cityId of region.cityIds) {
        const city = this.worldEngine.cityManager.getCity(cityId);
        if (city) {
          this.registerEntity({
            id: city.id,
            type: 'CITY',
            position: city.coordinates,
            regionId: region.id,
            metadata: { name: city.name }
          });

          for (const distId of city.districtIds) {
            const district = this.worldEngine.districtManager.getDistrict(distId);
            if (district) {
              for (const bId of district.buildingIds) {
                const building = this.worldEngine.buildingManager.getBuilding(bId);
                if (building) {
                  this.registerEntity({
                    id: building.id,
                    type: 'BUILDING',
                    position: building.coordinates,
                    regionId: region.id,
                    metadata: { name: building.name, type: building.type }
                  });
                }
              }
            }
          }
        }
      }
    }
  }

  // --- Entity Lifecycle Methods ---

  public registerEntity(entity: SpatialEntity): void {
    this.index.insert(entity);
  }

  public updateEntityPosition(entity: SpatialEntity): void {
    this.index.update(entity);
  }

  public removeEntity(entityId: string): void {
    this.index.remove(entityId);
  }
}
