import { WorldEngine } from '@genesis/engine';
import { DistrictType, BuildingType } from '@genesis/shared';

class WorldService {
  public engine: WorldEngine;

  constructor() {
    this.engine = new WorldEngine();
  }

  public async initialize() {
    if (this.engine.worldManager.getWorld() !== null) {
      console.log('[WorldService] World already loaded from persistence, skipping generation.');
      return;
    }
    
    // Removed "Genesis Prime (Recovered)" dummy check.
    // If we're here, it means we don't have an active world loaded. We will generate a new one.

    await this.generatePopulatedWorld('Genesis Prime', 'The first simulation world.', Math.floor(Date.now() / 1000));
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
      coordinates: { x: 0, y: 0 },
      area: 2500,
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

    // FIX: Persist all generated entities to SQLite
    const { worldRepository, simulationRepository } = await import('../repositories');
    
    await worldRepository.createWorld({
      id: world.id,
      name: world.name,
      description: world.description,
      randomSeed: world.randomSeed,
      creationTime: world.creationTime,
      currentPopulation: world.currentPopulation,
      worldSize: world.worldSize,
      climateProfile: world.climateProfile,
      timeZone: world.timeZone,
      version: world.version,
      status: world.status,
      createdAt: world.createdAt,
      updatedAt: world.updatedAt,
    });

    await worldRepository.createRegion({
      id: defaultRegion.id,
      worldId: world.id,
      name: defaultRegion.name,
      climate: defaultRegion.climate,
      description: defaultRegion.description,
      population: defaultRegion.population,
      coordX: defaultRegion.coordinates.x,
      coordY: defaultRegion.coordinates.y,
      createdAt: defaultRegion.createdAt,
      updatedAt: defaultRegion.updatedAt,
    });

    await worldRepository.createCity({
      id: city.id,
      regionId: defaultRegion.id,
      name: city.name,
      population: city.population,
      area: city.area,
      coordX: city.coordinates.x,
      coordY: city.coordinates.y,
      createdAt: city.createdAt,
      updatedAt: city.updatedAt,
    });

    await worldRepository.createDistrict({
      id: district.id,
      cityId: city.id,
      name: district.name,
      type: district.type,
      area: district.area,
      coordX: district.coordinates.x,
      coordY: district.coordinates.y,
      createdAt: district.createdAt,
      updatedAt: district.updatedAt,
    });

    await worldRepository.createBuilding({
      id: factoryBuilding.id,
      districtId: district.id,
      name: factoryBuilding.name,
      type: factoryBuilding.type,
      capacity: factoryBuilding.capacity,
      status: factoryBuilding.status,
      coordX: factoryBuilding.coordinates.x,
      coordY: factoryBuilding.coordinates.y,
      createdAt: factoryBuilding.createdAt,
      updatedAt: factoryBuilding.updatedAt,
    });

    await worldRepository.createBuilding({
      id: storeBuilding.id,
      districtId: district.id,
      name: storeBuilding.name,
      type: storeBuilding.type,
      capacity: storeBuilding.capacity,
      status: storeBuilding.status,
      coordX: storeBuilding.coordinates.x,
      coordY: storeBuilding.coordinates.y,
      createdAt: storeBuilding.createdAt,
      updatedAt: storeBuilding.updatedAt,
    });

    // We also need to set the activeWorldId in SimulationState
    const { timeService } = await import('./time.service');
    await simulationRepository.upsertSimulationState(
      timeService.engine.getCurrentTime(),
      timeService.engine.getSpeed(),
      world.id
    );

    // Save generated workplaces
    const { workplaceRepository, citizenRepository } = await import('../repositories');
    const allWorkplaces = this.engine.workplaceRepository.findAll();
    const wpData = allWorkplaces.map(wp => ({
      id: wp.id,
      type: wp.type,
      locationId: wp.locationId,
      regionId: wp.regionId,
      capacity: wp.capacity,
      occupiedPositions: wp.occupiedPositions,
      vacancies: wp.vacancies,
      inventoryId: wp.inventoryId,
      storageCapacity: wp.storageCapacity,
      walletId: (wp as any).wallet?.id || null,
      revenue: wp.revenue,
      expenses: wp.expenses,
      profit: wp.profit
    }));

    for (let i = 0; i < wpData.length; i += 50) {
      await workplaceRepository.createManyWorkplaces(wpData.slice(i, i + 50));
    }

    // Save generated citizens
    const allCitizens = citizenService.engine.listCitizens();
    const cData = allCitizens.map((c: any) => ({
      id: c.id,
      name: c.name,
      gender: c.gender,
      status: c.status,
      birthDateJson: JSON.stringify(c.birthDate),
      createdAtSimJson: JSON.stringify(c.createdAt),
      locationId: c.locationId,
      vitalStateJson: JSON.stringify(c.vitalState),
      personalityJson: JSON.stringify(c.personality),
      walletId: c.wallet?.id,
      movementState: c.movementState,
      activeRouteJson: c.activeRoute ? JSON.stringify(c.activeRoute) : null,
      skillsJson: JSON.stringify(c.skills),
      employmentStatus: c.employmentStatus,
      workplaceId: c.workplaceId,
      jobType: c.jobType,
      jobScheduleJson: c.jobSchedule ? JSON.stringify(c.jobSchedule) : null,
      householdId: null, // Avoid FK constraint until households are generated
    }));

    for (let i = 0; i < cData.length; i += 50) {
      await citizenRepository.createManyCitizens(cData.slice(i, i + 50));
    }

    return world;
  }
}

export const worldService = new WorldService();
