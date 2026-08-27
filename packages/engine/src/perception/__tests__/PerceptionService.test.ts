import { PerceptionService } from '../PerceptionService';
import { CitizenService } from '../../citizen/services/CitizenService';
import { WorldEngine } from '../../world/WorldEngine';
import { EnvironmentEngine } from '../../environment/EnvironmentEngine';
import { ResourceEngine } from '../../resources/ResourceEngine';
import { TimeEngine } from '../../time/TimeEngine';
import { EventScheduler } from '../../events/EventScheduler';
import { SpatialEngine } from '../../spatial/SpatialEngine';
import { InMemoryCitizenRepository } from '../../citizen/repositories/InMemoryCitizenRepository';
import { CitizenGender, ResourceCategory, ResourceType } from '@genesis/shared';
import { PerceptionConfig } from '../PerceptionConfig';

describe('Perception System (Phase 4.2)', () => {
  let timeEngine: TimeEngine;
  let eventScheduler: EventScheduler;
  let worldEngine: WorldEngine;
  let spatialEngine: SpatialEngine;
  let citizenRepository: InMemoryCitizenRepository;
  let citizenService: CitizenService;
  let environmentEngine: EnvironmentEngine;
  let resourceEngine: ResourceEngine;
  let perceptionService: PerceptionService;

  beforeEach(() => {
    timeEngine = new TimeEngine();
    eventScheduler = new EventScheduler(timeEngine);
    worldEngine = new WorldEngine();
    spatialEngine = new SpatialEngine(worldEngine, eventScheduler);
    citizenRepository = new InMemoryCitizenRepository();
    
    citizenService = new CitizenService(
      citizenRepository,
      worldEngine,
      timeEngine,
      eventScheduler,
      spatialEngine.queryService
    , new (require('../../citizen/services/HouseholdService').HouseholdService)(new (require('../../inventory/InventoryManager').InventoryManager)()));

    environmentEngine = new EnvironmentEngine(worldEngine, eventScheduler, timeEngine);
    resourceEngine = new ResourceEngine(worldEngine, environmentEngine, eventScheduler, timeEngine);

    perceptionService = new PerceptionService(
      citizenService,
      worldEngine,
      environmentEngine,
      resourceEngine,
      timeEngine,
      spatialEngine.queryService
    );
    
    // Create world
    worldEngine.worldManager.createWorld('Genesis', 'Test world', 12345);
  });

  it('TEST 1: Citizen perception snapshot is generated', async () => {
    // Setup Region
    const region = worldEngine.regionManager.createRegion({ name: 'Test Region', description: 'desc', population: 0, worldId: 'world-1', coordinates: { x: 10, y: 10 }, climate: 'Temperate', createdAt: new Date(), updatedAt: new Date() });
    worldEngine.worldManager.addRegion(region.id);

    const citizen = citizenService.createCitizen(CitizenGender.MALE, region.id);

    const snapshot = await perceptionService.generateSnapshot(citizen.id);
    expect(snapshot).toBeDefined();
    expect(snapshot.citizenId).toBe(citizen.id);
  });

  it('TEST 2 & 3: Self state and location are correct', async () => {
    const region = worldEngine.regionManager.createRegion({ name: 'Test Region', description: 'desc', population: 0, worldId: 'world-1', coordinates: { x: 50, y: 50 }, climate: 'Temperate', createdAt: new Date(), updatedAt: new Date() });
    worldEngine.worldManager.addRegion(region.id);

    const citizen = citizenService.createCitizen(CitizenGender.FEMALE, region.id);
    
    const snapshot = await perceptionService.generateSnapshot(citizen.id);
    
    expect(snapshot.self.citizenId).toBe(citizen.id);
    expect(snapshot.self.age).toBeDefined();
    expect(snapshot.self.vitalState).toBeDefined();
    
    expect(snapshot.location.regionId).toBe(region.id);
    expect(snapshot.location.coordinates).toEqual({ x: 50, y: 50 });
  });

  it('TEST 4: Environment state comes from Environment Engine', async () => {
    const region = worldEngine.regionManager.createRegion({ name: 'Test Region', description: 'desc', population: 0, worldId: 'world-1', coordinates: { x: 10, y: 10 }, climate: 'Temperate', createdAt: new Date(), updatedAt: new Date() });
    worldEngine.worldManager.addRegion(region.id);
    
    // Setup specific weather for test
    jest.spyOn(environmentEngine.weatherManager, 'getRegionWeather').mockReturnValue({
      regionId: region.id,
      currentType: 'Storm',
      durationHours: 10,
      timeInCurrentWeather: 1
    });
    
    const citizen = citizenService.createCitizen(CitizenGender.MALE, region.id);

    const snapshot = await perceptionService.generateSnapshot(citizen.id);
    
    expect(snapshot.environment.weather).toBe('Storm');
  });

  it('TEST 5: Resource information comes from Resource Engine', async () => {
    const region = worldEngine.regionManager.createRegion({ name: 'Test Region', description: 'desc', population: 0, worldId: 'world-1', coordinates: { x: 10, y: 10 }, climate: 'Temperate', createdAt: new Date(), updatedAt: new Date() });
    worldEngine.worldManager.addRegion(region.id);
    
    // Add resource
    resourceEngine.resourceManager.addResource({
      regionId: region.id,
      category: ResourceCategory.RENEWABLE,
      type: ResourceType.WATER,
      name: 'River',
      currentAmount: 1000,
      maximumAmount: 10000,
      naturalRecoveryRate: 10,
      consumptionRate: 0,
      condition: null,
      unit: 'L',
      renewable: true,
      extractionDifficulty: 1
    });
    
    const citizen = citizenService.createCitizen(CitizenGender.MALE, region.id);
    const snapshot = await perceptionService.generateSnapshot(citizen.id);
    
    expect(snapshot.nearbyResources.length).toBe(1);
    expect(snapshot.nearbyResources[0].quantity).toBe(1000);
    expect(snapshot.nearbyResources[0].type).toBe(ResourceType.WATER);
  });

  it('TEST 6 & 7: Nearby buildings and entities are spatially filtered', async () => {
    const region = worldEngine.regionManager.createRegion({ name: 'Test Region', description: 'desc', population: 0, worldId: 'world-1', coordinates: { x: 10, y: 10 }, climate: 'Temperate', createdAt: new Date(), updatedAt: new Date() });
    worldEngine.worldManager.addRegion(region.id);
    
    const city = worldEngine.cityManager.createCity({ name: 'City', population: 0, regionId: region.id, coordinates: { x: 10, y: 10 }, area: 100, createdAt: new Date(), updatedAt: new Date() });
    region.cityIds.push(city.id);
    
    const district = worldEngine.districtManager.createDistrict({ name: 'D1', type: 'RESIDENTIAL' as any, cityId: city.id, createdAt: new Date(), updatedAt: new Date() });
    city.districtIds.push(district.id);
    
    // Building close to citizen
    const buildingNear = worldEngine.buildingManager.createBuilding({ name: 'B1', type: 'HOUSE' as any, coordinates: { x: 15, y: 15 }, capacity: 10, status: 'OK', districtId: district.id, createdAt: new Date(), updatedAt: new Date() });
    district.buildingIds.push(buildingNear.id);
    spatialEngine.index.insert({ id: buildingNear.id, type: 'BUILDING', position: buildingNear.coordinates });

    // Building far from citizen
    const buildingFar = worldEngine.buildingManager.createBuilding({ name: 'B2', type: 'HOUSE' as any, coordinates: { x: 10000, y: 10000 }, capacity: 10, status: 'OK', districtId: district.id, createdAt: new Date(), updatedAt: new Date() });
    district.buildingIds.push(buildingFar.id);
    spatialEngine.index.insert({ id: buildingFar.id, type: 'BUILDING', position: buildingFar.coordinates });

    const citizen = citizenService.createCitizen(CitizenGender.MALE, region.id);
    const snapshot = await perceptionService.generateSnapshot(citizen.id);

    expect(snapshot.nearbyBuildings.length).toBe(1);
    expect(snapshot.nearbyBuildings[0].id).toBe(buildingNear.id);
  });

  it('TEST 8: Perception radius is respected', async () => {
    const radius = PerceptionConfig.DEFAULT_PERCEPTION_RADIUS;
    
    const region = worldEngine.regionManager.createRegion({ name: 'Test Region', description: 'desc', population: 0, worldId: 'world-1', coordinates: { x: 0, y: 0 }, climate: 'Temperate', createdAt: new Date(), updatedAt: new Date() });
    worldEngine.worldManager.addRegion(region.id);

    const citizen1 = citizenService.createCitizen(CitizenGender.MALE, region.id);
    // Citizen 2 is at distance = radius + 1
    const citizen2 = citizenService.createCitizen(CitizenGender.FEMALE, region.id);
    
    // Manually insert to spatial index to mock exact coordinates
    spatialEngine.index.insert({ id: citizen1.id, type: 'CITIZEN', position: { x: 0, y: 0 } });
    spatialEngine.index.insert({ id: citizen2.id, type: 'CITIZEN', position: { x: radius + 1, y: 0 } });

    // Note: in actual implementation, we might need to mock getEntityCoordinates or locationId
    // Let's mock citizen1 to be at 0,0
    jest.spyOn(worldEngine, 'getEntityCoordinates').mockImplementation((id) => {
      if (id === region.id) return { x: 0, y: 0 }; // citizen1 is in region
      return undefined;
    });

    const snapshot = await perceptionService.generateSnapshot(citizen1.id);
    
    // Citizen 2 is outside radius, so nearbyEntities should be empty
    expect(snapshot.nearbyEntities.length).toBe(0);
  });

  it('TEST 9 & 10 & 11: Determinism, no mutation, no decisions', async () => {
    const region = worldEngine.regionManager.createRegion({ name: 'Test Region', description: 'desc', population: 0, worldId: 'world-1', coordinates: { x: 10, y: 10 }, climate: 'Temperate', createdAt: new Date(), updatedAt: new Date() });
    worldEngine.worldManager.addRegion(region.id);
    
    // Mock environment to avoid Math.random() noise in EnvironmentCalculator
    jest.spyOn(environmentEngine, 'getEnvironmentalState').mockReturnValue({
      regionId: region.id,
      temperature: 20,
      feelsLikeTemperature: 20,
      humidity: 50,
      windSpeed: 10,
      visibility: 10,
      cloudCoverage: 0,
      uvIndex: 5,
      airPressure: 1000
    });
    
    const citizen = citizenService.createCitizen(CitizenGender.MALE, region.id);

    const originalVitalState = { ...citizen.vitalState };

    const snapshot1 = await perceptionService.generateSnapshot(citizen.id);
    const snapshot2 = await perceptionService.generateSnapshot(citizen.id);

    // Omit timestamp for comparison
    const { timestamp: t1, ...s1 } = snapshot1;
    const { timestamp: t2, ...s2 } = snapshot2;

    // Deterministic output
    expect(s1).toEqual(s2);

    // No mutation
    expect(citizen.vitalState).toEqual(originalVitalState);
  });

  it('TEST 12 & 13: Missing citizen/location produces error', async () => {
    expect(() => {
      perceptionService.generateSnapshot('non-existent');
    }).toThrow('PerceptionService: Citizen non-existent not found.');
    
    const citizen = citizenService.createCitizen(CitizenGender.MALE); // No location
    expect(() => {
      perceptionService.generateSnapshot(citizen.id);
    }).toThrow(/no location/);
  });
});

