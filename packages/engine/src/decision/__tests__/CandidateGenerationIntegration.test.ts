import { ActionType, CitizenGender, CitizenStatus, DecisionTriggerType, EmploymentStatus, SimulationTime, RoutineActivityType, DistrictType, BuildingType } from '@genesis/shared';
import { WorldEngine } from '../../world/WorldEngine';
import { TimeEngine } from '../../time/TimeEngine';
import { CitizenRepository } from '../../citizen/repositories/CitizenRepository';
import { InMemoryCitizenRepository } from '../../citizen/repositories/InMemoryCitizenRepository';
import { CitizenService } from '../../citizen/services/CitizenService';
import { HouseholdService } from '../../citizen/services/HouseholdService';
import { EventScheduler } from '../../events/EventScheduler';
import { SpatialQueryService } from '../../spatial/SpatialQueryService';
import { DecisionEngine } from '../DecisionEngine';
import { HardConstraintFilter } from '../utility/evaluators/HardConstraintFilter';

import { InventoryManager } from '../../inventory/InventoryManager';

describe('Candidate Generation Integration (T5.4)', () => {
  let worldEngine: WorldEngine;
  let timeEngine: TimeEngine;
  let eventScheduler: EventScheduler;
  let spatialQueryService: SpatialQueryService;
  let citizenRepository: CitizenRepository;
  let inventoryManager: InventoryManager;
  let householdService: HouseholdService;
  let citizenService: CitizenService;

  beforeEach(() => {
    worldEngine = new WorldEngine();
    timeEngine = new TimeEngine();
    eventScheduler = new EventScheduler();
    spatialQueryService = new SpatialQueryService(new (require('../../spatial/GridSpatialIndex').GridSpatialIndex)(100), worldEngine);
    citizenRepository = new InMemoryCitizenRepository();
    inventoryManager = new InventoryManager();
    householdService = new HouseholdService(inventoryManager);
    
    citizenService = new CitizenService(
      citizenRepository,
      worldEngine,
      timeEngine,
      eventScheduler,
      spatialQueryService,
      householdService
    );
    
    // Stub perception service for the test
    citizenService.setPerceptionService({
      generateSnapshot: (id: string) => ({
        timestamp: new Date(),
        nearbyBuildings: [],
        nearbyResources: []
      })
    } as any);

    // Initialize world
    worldEngine.reset();
  });

  it('Integration scenario: Real persistence of home and workplace through the decision pipeline', () => {
    // 1. Setup World
    const region = worldEngine.regionManager.createRegion({ name: 'Test Region', description: '', climate: 'Temperate', population: 0, coordinates: { x: 0, y: 0 }, worldId: 'world-1', createdAt: new Date(), updatedAt: new Date() });
    const city = worldEngine.cityManager.createCity({ regionId: region.id, name: 'Test City', population: 0, coordinates: { x: 0, y: 0 }, area: 100, createdAt: new Date(), updatedAt: new Date() });
    const district = worldEngine.districtManager.createDistrict({ cityId: city.id, name: 'Test District', type: DistrictType.RESIDENTIAL, createdAt: new Date(), updatedAt: new Date() });
    
    // Home Building
    const homeBuilding = worldEngine.buildingManager.createBuilding({ districtId: district.id, name: 'Home Building', type: BuildingType.HOUSE, coordinates: { x: 5, y: 5 }, capacity: 4, status: 'OK', createdAt: new Date(), updatedAt: new Date() });
    
    // Workplace Building
    const workDistrict = worldEngine.districtManager.createDistrict({ cityId: city.id, name: 'Work District', type: DistrictType.COMMERCIAL, createdAt: new Date(), updatedAt: new Date() });
    const workBuilding = worldEngine.buildingManager.createBuilding({ districtId: workDistrict.id, name: 'Work Building', type: BuildingType.OFFICE, coordinates: { x: 25, y: 25 }, capacity: 10, status: 'OK', createdAt: new Date(), updatedAt: new Date() });

    // 2. Setup Workplace
    const workplace = {
      id: 'wp-int-1',
      type: 'OFFICE' as any,
      locationId: workBuilding.id,
      regionId: region.id,
      capacity: 10,
      occupiedPositions: 1,
      vacancies: 9,
      positions: [
        {
          id: 'pos-1',
          workplaceId: 'wp-int-1',
          type: 'OFFICE_WORKER' as any,
          requiredSkills: {},
          occupantId: 'citizen-000001',
          schedule: { startTime: 9, endTime: 17 }
        }
      ]
    };
    worldEngine.workplaceRepository.create(workplace);

    // 3. Setup Citizen & Household
    const citizen = citizenService.createCitizen(CitizenGender.MALE, workBuilding.id, { year: 1990, month: 1, day: 1, hour: 0, minute: 0, second: 0 });
    
    // Attach to the home building
    const household = householdService.getHousehold(citizen.householdId!);
    expect(household).toBeDefined();
    if (household) {
      household.locationId = homeBuilding.id;
    }

    // Attach to the workplace
    citizen.employmentStatus = EmploymentStatus.EMPLOYED;
    citizen.workplaceId = workplace.id;
    citizen.jobSchedule = { startTime: 9, endTime: 17 };
    // Citizen is currently at work
    citizen.locationId = workBuilding.id;
    citizenService['repository'].update(citizen); // force update

    // Override time to be 18:00 (after work)
    jest.spyOn(timeEngine, 'getCurrentTime').mockReturnValue({ year: 2026, month: 1, day: 1, hour: 18, minute: 0, second: 0 });
    
    // Mock routine activity
    jest.spyOn(citizenService['routineEngine'], 'getCurrentActivity').mockReturnValue({
      id: 'mock-act',
      interruptible: true,
      type: RoutineActivityType.REST,
      destinationType: 'HOME',
      startTime: 18,
      endTime: 6
    });

    // Ensure citizen is processed
    citizenService.tickCitizen(citizen.id);

    // Retrieve history from DecisionEngine to see what happened
    const history = citizenService['decisionEngine'].getHistory(citizen.id);
    expect(history.length).toBeGreaterThan(0);
    
    const lastDecision = history[history.length - 1];
    
    // Since it's 18:00 (after work), their routine activity will be 'REST' or 'MEAL' or similar
    // The candidate generator should produce a GO_HOME candidate since they are at work building.
    expect(lastDecision.candidateActions).toContain(ActionType.GO_HOME);

    // Make sure we didn't generate GO_TO_WORK since it's 18:00 and they are already there anyway
    expect(lastDecision.candidateActions).not.toContain(ActionType.GO_TO_WORK);
    
    // Confirm the decision pipeline operated and selected a valid action
    expect(lastDecision.selectedAction).toBeDefined();
  });
});
