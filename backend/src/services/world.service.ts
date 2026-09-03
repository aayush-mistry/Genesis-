import { WorldEngine } from '@genesis/engine';
import { DistrictType, BuildingType } from '@genesis/shared';

class WorldService {
  public engine: WorldEngine;

  constructor() {
    this.engine = new WorldEngine();
  }

  public async initialize() {
    await this.generatePopulatedWorld('Genesis Prime', 'The first simulation world.', Date.now());
  }

  public async generatePopulatedWorld(name: string, description: string, seed: number) {
    const world = this.engine.worldManager.createWorld(name, description, seed);
    
    // Auto-create a default region
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

    // Auto-generate resources for this new region
    const { resourceService } = await import('./resource.service');
    resourceService.engine.generateResourcesForRegion(defaultRegion.id, world.randomSeed);

    // Generate basic urban hierarchy to allow workplaces to spawn
    const city = this.engine.cityManager.createCity({
      name: 'Genesis City',
      regionId: defaultRegion.id,
      coordinates: { x: 0, y: 0 },
      population: 0,
      area: 100,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    this.engine.regionManager.addCity(defaultRegion.id, city.id);

    const district = this.engine.districtManager.createDistrict({
      name: 'Central District',
      cityId: city.id,
      type: DistrictType.COMMERCIAL,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    this.engine.cityManager.addDistrict(city.id, district.id);

    const factoryBuilding = this.engine.buildingManager.createBuilding({
      name: 'Central Factory',
      districtId: district.id,
      type: BuildingType.FACTORY,
      capacity: 100,
      coordinates: { x: 0, y: 0 },
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date()
    });
    this.engine.districtManager.addBuilding(district.id, factoryBuilding.id);
    
    const storeBuilding = this.engine.buildingManager.createBuilding({
      name: 'General Store',
      districtId: district.id,
      type: BuildingType.STORE,
      capacity: 50,
      coordinates: { x: 0, y: 0 },
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date()
    });
    this.engine.districtManager.addBuilding(district.id, storeBuilding.id);

    // Generate Workplaces
    this.engine.workplaceGenerator.generateWorkplaces();

    // Initialize Inventories, Wallets, and configs for Producers
    const { supplyService } = await import('./supply.service');
    supplyService.setupWorkplaceInventories();

    // Initialize population
    const { citizenService } = await import('./citizen.service');
    citizenService.simulator.initializePopulation(5000);

    // FIX: Assign a valid location to the persistent test citizen so perception API works
    const testCitizen = citizenService.engine.getCitizen('test-citizen-banking');
    if (testCitizen) {
      testCitizen.locationId = storeBuilding.id;
    }

    return world;
  }
}

export const worldService = new WorldService();
