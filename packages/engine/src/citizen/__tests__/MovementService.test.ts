import { MovementService } from '../services/MovementService';
import { EventRegistry } from '../../events/EventRegistry';
import { InMemoryCitizenRepository } from '../repositories/InMemoryCitizenRepository';
import { WorldEngine } from '../../world/WorldEngine';
import { TimeEngine } from '../../time/TimeEngine';
import { EventScheduler } from '../../events/EventScheduler';
import { SpatialEngine } from '../../spatial/SpatialEngine';
import { CitizenGender, CitizenStatus, MovementState, DistrictType, BuildingType } from '@genesis/shared';
import { CitizenService } from '../services/CitizenService';

describe('MovementService', () => {
  let repository: InMemoryCitizenRepository;
  let worldEngine: WorldEngine;
  let timeEngine: TimeEngine;
  let eventScheduler: EventScheduler;
  let spatialEngine: SpatialEngine;
  let citizenService: CitizenService;
  let movementService: MovementService;

  beforeEach(() => {
    repository = new InMemoryCitizenRepository();
    worldEngine = new WorldEngine();
    timeEngine = new TimeEngine();
    eventScheduler = new EventScheduler(timeEngine);
    spatialEngine = new SpatialEngine(worldEngine, eventScheduler);
    
    citizenService = new CitizenService(
      repository,
      worldEngine,
      timeEngine,
      eventScheduler,
      spatialEngine.queryService
    , new (require('../../citizen/services/HouseholdService').HouseholdService)(new (require('../../inventory/InventoryManager').InventoryManager)()));
    movementService = citizenService.movementService;

    // Set up dummy world locations
    const date = new Date();
    const region = worldEngine.regionManager.createRegion({ name: 'Test Region', description: 'Test', climate: 'Temperate', population: 0, worldId: 'world-1', coordinates: { x: 0, y: 0 }, createdAt: date, updatedAt: date });
    const city = worldEngine.cityManager.createCity({ name: 'Test City', regionId: region.id, population: 0, area: 100, coordinates: { x: 100, y: 100 }, createdAt: date, updatedAt: date });
    const dist1 = worldEngine.districtManager.createDistrict({ name: 'Dist1', cityId: city.id, type: DistrictType.RESIDENTIAL, createdAt: date, updatedAt: date });
    const dist2 = worldEngine.districtManager.createDistrict({ name: 'Dist2', cityId: city.id, type: DistrictType.RESIDENTIAL, createdAt: date, updatedAt: date });
    
    // b1 is at 0, 0
    worldEngine.buildingManager.createBuilding({ name: 'House1', type: BuildingType.HOUSE, capacity: 5, status: 'BUILT', districtId: dist1.id, coordinates: { x: 0, y: 0 }, createdAt: date, updatedAt: date });
    // b2 is at 300, 400. Distance = 500
    worldEngine.buildingManager.createBuilding({ name: 'House2', type: BuildingType.HOUSE, capacity: 5, status: 'BUILT', districtId: dist2.id, coordinates: { x: 300, y: 400 }, createdAt: date, updatedAt: date });
  });

  it('should calculate route and schedule arrival event', () => {
    const buildings = worldEngine.buildingManager.getAllBuildings();
    const b1 = buildings[0];
    const b2 = buildings[1];

    const citizen = citizenService.createCitizen(CitizenGender.MALE, b1.id);
    
    expect(citizen.movementState).toBe(MovementState.IDLE);
    expect(citizen.activeRoute).toBeNull();
    expect(citizen.locationId).toBe(b1.id);

    const route = movementService.requestMovement(citizen.id, b2.id);

    // Distance is 500. Speed is 50/hour. Duration = 10 hours.
    expect(route.estimatedTravelDurationHours).toBe(10);
    expect(route.status).toBe('ACTIVE');

    const updatedCitizen = repository.findById(citizen.id);
    expect(updatedCitizen?.movementState).toBe(MovementState.TRAVELLING);
    expect(updatedCitizen?.activeRoute).not.toBeNull();

    // Check if event is scheduled
    const event = eventScheduler.getEvent(`arrival-${route.id}`);
    expect(event).toBeDefined();
    expect(event?.status).toBe('Scheduled');
    
    // Arrival should be at hour 10
    expect(event?.scheduledTime.hour).toBe(10);
  });

  it('should arrive when scheduled event is handled', () => {
    const buildings = worldEngine.buildingManager.getAllBuildings();
    const b1 = buildings[0];
    const b2 = buildings[1];

    const citizen = citizenService.createCitizen(CitizenGender.FEMALE, b1.id);
    const route = movementService.requestMovement(citizen.id, b2.id);
    
    const event = eventScheduler.getEvent(`arrival-${route.id}`);
    
    // Manually trigger the handler
    if (event) {
      EventRegistry.resolve(event.handlerName)(event);
    }

    const updatedCitizen = repository.findById(citizen.id);
    expect(updatedCitizen?.movementState).toBe(MovementState.IDLE);
    expect(updatedCitizen?.locationId).toBe(b2.id);
    expect(updatedCitizen?.activeRoute).toBeNull();
  });

  it('should not allow movement if already travelling', () => {
    const buildings = worldEngine.buildingManager.getAllBuildings();
    const b1 = buildings[0];
    const b2 = buildings[1];

    const citizen = citizenService.createCitizen(CitizenGender.MALE, b1.id);
    movementService.requestMovement(citizen.id, b2.id);
    
    expect(() => {
      movementService.requestMovement(citizen.id, b1.id);
    }).toThrow(/already travelling/);
  });

  it('should allow cancelling movement', () => {
    const buildings = worldEngine.buildingManager.getAllBuildings();
    const b1 = buildings[0];
    const b2 = buildings[1];

    const citizen = citizenService.createCitizen(CitizenGender.FEMALE, b1.id);
    const route = movementService.requestMovement(citizen.id, b2.id);
    
    movementService.cancelMovement(citizen.id);
    
    const updatedCitizen = repository.findById(citizen.id);
    expect(updatedCitizen?.movementState).toBe(MovementState.IDLE);
    expect(updatedCitizen?.locationId).toBe(b1.id);
    expect(updatedCitizen?.activeRoute).toBeNull();

    const event = eventScheduler.getEvent(`arrival-${route.id}`);
    expect(event?.cancelFlag).toBe(true);
  });
});

