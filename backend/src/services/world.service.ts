import { WorldEngine } from '@genesis/engine';

class WorldService {
  public engine: WorldEngine;

  constructor() {
    this.engine = new WorldEngine();
  }

  public async initialize() {
    const world = this.engine.worldManager.createWorld('Genesis Prime', 'The first simulation world.', Date.now());
    
    const defaultRegion = this.engine.regionManager.createRegion({
      name: 'Genesis Valley',
      climate: 'Temperate',
      description: 'The cradle of civilization in this world.',
      population: 0,
      coordinates: { x: 0, y: 0 },
      worldId: world.id,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    this.engine.worldManager.addRegion(defaultRegion.id);

    const { resourceService } = await import('./resource.service');
    resourceService.engine.generateResourcesForRegion(defaultRegion.id, world.randomSeed);

    const { citizenService } = await import('./citizen.service');
    citizenService.simulator.initializePopulation(5000);
  }
}

export const worldService = new WorldService();
