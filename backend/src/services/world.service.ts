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
      width: 10000,
      height: 10000,
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
      width: 2000,
      height: 2000,
      population: 0,
      area: 250000, // 500x500
      createdAt: new Date(),
      updatedAt: new Date()
    });
    this.engine.regionManager.addCity(defaultRegion.id, city.id);

    const district = this.engine.districtManager.createDistrict({
      name: 'Central District',
      cityId: city.id,
      type: DistrictType.COMMERCIAL,
      coordinates: { x: 100, y: 100 },
      width: 500,
      height: 500,
      area: 10000, // 100x100

      createdAt: new Date(),
      updatedAt: new Date()
    });
    this.engine.cityManager.addDistrict(city.id, district.id);

    const factoryBuilding = this.engine.buildingManager.createBuilding({
      name: 'Central Factory',
      districtId: district.id,
      type: BuildingType.FACTORY,
      capacity: 100,
      coordinates: { x: 120, y: 120 },
      width: 40,
      height: 40,
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
      coordinates: { x: 200, y: 200 },
      width: 20,
      height: 20,
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date()
    });
    this.engine.districtManager.addBuilding(district.id, storeBuilding.id);

    // Generate Residential District
    const residentialDistrict = this.engine.districtManager.createDistrict({
      name: 'Residential District',
      cityId: city.id,
      type: DistrictType.RESIDENTIAL,
      coordinates: { x: -200, y: 100 },
      width: 500,
      height: 500,
      area: 10000,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    this.engine.cityManager.addDistrict(city.id, residentialDistrict.id);

    const apartmentBuildings: any[] = [];
    for (let i = 0; i < 10; i++) {
      const apartment = this.engine.buildingManager.createBuilding({
        name: `Apartment Complex ${i + 1}`,
        districtId: residentialDistrict.id,
        type: BuildingType.APARTMENT,
        capacity: 500,
        coordinates: { x: -350 + (i % 5) * 60, y: 0 + Math.floor(i / 5) * 60 },
        width: 30,
        height: 30,
        status: 'ACTIVE',
        createdAt: new Date(),
        updatedAt: new Date()
      });
      this.engine.districtManager.addBuilding(residentialDistrict.id, apartment.id);
      apartmentBuildings.push(apartment);
    }

    // Generate Workplaces
    this.engine.workplaceGenerator.generateWorkplaces();

    // Initialize Inventories, Wallets, and configs for Producers
    const { supplyService } = await import('./supply.service');
    supplyService.setupWorkplaceInventories();

    // Initialize population
    const { citizenService } = await import('./citizen.service');
    citizenService.simulator.initializePopulation(5000);

    // Assign citizens to households
    const allCitizens = citizenService.engine.listCitizens();
    let citizenIndex = 0;
    const generatedHouseholds: any[] = [];
    for (const apartment of apartmentBuildings) {
      for (let h = 0; h < 100; h++) { // 100 households per apartment (5 members each)
        const household = citizenService.engine.householdService.createHousehold(apartment.id);
        generatedHouseholds.push(household);
        for (let m = 0; m < 5; m++) {
          if (citizenIndex < allCitizens.length) {
            const c: any = allCitizens[citizenIndex];
            c.locationId = household.locationId;
            c.householdId = household.id;
            // Generate exact coordinates inside the apartment bounds
            const w = apartment.width;
            const h2 = apartment.height;
            c.coordX = apartment.coordinates.x - w/2 + Math.random() * w;
            c.coordY = apartment.coordinates.y - h2/2 + Math.random() * h2;
            citizenService.engine.householdService.addMember(household.id, c.id);
            citizenIndex++;
          }
        }
      }
    }

    // FIX: Assign a valid location to the persistent test citizen so perception API works
    const testCitizen = citizenService.engine.getCitizen('test-citizen-banking');
    if (testCitizen) {
      testCitizen.locationId = storeBuilding.id;
      testCitizen.coordX = storeBuilding.coordinates.x;
      testCitizen.coordY = storeBuilding.coordinates.y;
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
      width: world.width,
      height: world.height,
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
      width: defaultRegion.width,
      height: defaultRegion.height,
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
      width: city.width,
      height: city.height,
      createdAt: city.createdAt,
      updatedAt: city.updatedAt,
    });

    const allDistricts = this.engine.districtManager.getAllDistricts();
    for (const d of allDistricts) {
      await worldRepository.createDistrict({
        id: d.id,
        cityId: d.cityId,
        name: d.name,
        type: d.type,
        area: d.area,
        coordX: d.coordinates.x,
        coordY: d.coordinates.y,
        width: d.width,
        height: d.height,
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
      });
    }

    const allBuildings = this.engine.buildingManager.getAllBuildings();
    for (const b of allBuildings) {
      await worldRepository.createBuilding({
        id: b.id,
        districtId: b.districtId,
        name: b.name,
        type: b.type,
        capacity: b.capacity,
        status: b.status,
        coordX: b.coordinates.x,
        coordY: b.coordinates.y,
        width: b.width,
        height: b.height,
        createdAt: b.createdAt,
        updatedAt: b.updatedAt,
      });
    }

    // Save households
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();
    const householdData = generatedHouseholds.map(h => ({
      id: h.id,
      locationId: h.locationId,
      inventoryId: h.inventoryId,
      walletId: h.walletId
    }));
    for (let i = 0; i < householdData.length; i += 50) {
      await prisma.household.createMany({ data: householdData.slice(i, i + 50) });
    }
    await prisma.$disconnect();

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
    const finalCitizens = citizenService.engine.listCitizens();
    const cData = finalCitizens.map((c: any) => ({
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
      householdId: c.householdId || null,
      coordX: c.coordX || null,
      coordY: c.coordY || null,
    }));

    for (let i = 0; i < cData.length; i += 50) {
      await citizenRepository.createManyCitizens(cData.slice(i, i + 50));
    }

    return world;
  }
}

export const worldService = new WorldService();
