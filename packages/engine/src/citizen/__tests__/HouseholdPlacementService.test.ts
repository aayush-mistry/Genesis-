import { CitizenGender, CitizenStatus, MovementState, BuildingType, DistrictType } from '@genesis/shared';
import { WorldEngine } from '../../world/WorldEngine';
import { HouseholdService } from '../services/HouseholdService';
import { HouseholdPlacementService } from '../services/HouseholdPlacementService';
import { InventoryManager } from '../../inventory/InventoryManager';
import { SettlementGenerator } from '../../world/services/SettlementGenerator';

describe('HouseholdPlacementService', () => {
  let worldEngine: WorldEngine;
  let inventoryManager: InventoryManager;
  let householdService: HouseholdService;
  let placementService: HouseholdPlacementService;

  let cityId: string;
  let districtId: string;
  let apartmentBuilding: any;

  beforeEach(() => {
    worldEngine = new WorldEngine();
    inventoryManager = new InventoryManager();
    householdService = new HouseholdService(inventoryManager);
    placementService = new HouseholdPlacementService(worldEngine, householdService);

    // Setup World, Region, City, District, and an Apartment building
    worldEngine.worldManager.createWorld('world-1', 'Test World');
    const region = worldEngine.regionManager.createRegion({
      name: 'Test Region',
      climate: 'Temperate',
      description: 'Region for placement test',
      population: 0,
      coordinates: { x: 0, y: 0 },
      worldId: 'world-1',
      createdAt: new Date(),
      updatedAt: new Date()
    });

    const city = worldEngine.cityManager.createCity({
      name: 'Test City',
      regionId: region.id,
      population: 0,
      coordinates: { x: 500, y: 500 },
      width: 1000,
      height: 1000,
      area: 1000000,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    cityId = city.id;

    const district = worldEngine.districtManager.createDistrict({
      name: 'Residential District',
      cityId: city.id,
      type: DistrictType.RESIDENTIAL,
      coordinates: { x: 500, y: 500 },
      width: 400,
      height: 400,
      area: 160000,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    districtId = district.id;

    apartmentBuilding = worldEngine.buildingManager.createBuilding({
      name: 'Central Apartment',
      districtId: district.id,
      type: BuildingType.APARTMENT,
      capacity: 500,
      coordinates: { x: 520, y: 530 },
      width: 40,
      height: 40,
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date()
    });
  });

  const createDummyCitizen = (id: string, name: string): any => ({
    id,
    name,
    gender: CitizenGender.FEMALE,
    status: CitizenStatus.ACTIVE,
    birthDate: { year: 1, month: 1, day: 1, hour: 0, minute: 0, second: 0 },
    createdAt: { year: 1, month: 1, day: 1, hour: 0, minute: 0, second: 0 },
    locationId: null,
    vitalState: { hunger: 0, thirst: 0, energy: 100, health: 100, lastUpdatedSimulationTime: { year: 1, month: 1, day: 1, hour: 0, minute: 0, second: 0 } },
    personality: { priceSensitivity: 50, qualityPreference: 50, conveniencePreference: 50, planningTendency: 50, socialEngagement: 50, riskTolerance: 50, savingTendency: 50 },
    movementState: MovementState.IDLE,
    activeRoute: null,
    skills: [],
    employmentStatus: 'UNEMPLOYED' as any,
    workplaceId: null,
    jobType: null,
    jobSchedule: null,
    wallet: { id: `wallet-${id}`, ownerId: id, balance: 100, totalIncome: 0, totalExpenses: 0, currency: 'GEN' }
  });

  test('1. A newborn joins its existing household when capacity permits', () => {
    // Create existing household in apartment
    const parentHh = householdService.createHousehold(apartmentBuilding.id);
    const parent = createDummyCitizen('parent-1', 'Mother');
    parent.householdId = parentHh.id;
    parent.locationId = apartmentBuilding.id;
    parent.coordX = 525;
    parent.coordY = 535;
    householdService.addMember(parentHh.id, parent.id);

    const newborn = createDummyCitizen('baby-1', 'Baby');

    const result = placementService.assignNewborn(newborn, parent);

    expect(result.success).toBe(true);
    expect(result.isNewHousehold).toBe(false);
    expect(result.householdId).toBe(parentHh.id);
    expect(result.locationId).toBe(apartmentBuilding.id);
    expect(newborn.householdId).toBe(parentHh.id);
    expect(newborn.locationId).toBe(apartmentBuilding.id);
    expect(newborn.coordX).toBe(525);
    expect(newborn.coordY).toBe(535);

    // Verify membership list
    const updatedHh = householdService.getHousehold(parentHh.id);
    expect(updatedHh?.members).toContain('baby-1');
    expect(updatedHh?.members.length).toBe(2);
  });

  test('2. An immigrant receives suitable residential placement with intentional coordinates', () => {
    const immigrant = createDummyCitizen('immigrant-1', 'Newcomer');

    const result = placementService.assignImmigrant(immigrant, cityId);

    expect(result.success).toBe(true);
    expect(result.isNewHousehold).toBe(true);
    expect(result.householdId).toBeDefined();
    expect(result.locationId).toBe(apartmentBuilding.id);
    expect(immigrant.householdId).toBe(result.householdId);
    expect(immigrant.locationId).toBe(apartmentBuilding.id);

    // Coordinates must be strictly inside apartment building bounds
    // Apartment center is (520, 530), width = 40, height = 40
    // Min X = 500, Max X = 540; Min Y = 510, Max Y = 550
    expect(immigrant.coordX).toBeGreaterThanOrEqual(500);
    expect(immigrant.coordX).toBeLessThanOrEqual(540);
    expect(immigrant.coordY).toBeGreaterThanOrEqual(510);
    expect(immigrant.coordY).toBeLessThanOrEqual(550);
    expect(immigrant.coordX).not.toBe(0);
    expect(immigrant.coordY).not.toBe(0);

    const createdHh = householdService.getHousehold(result.householdId!);
    expect(createdHh?.members).toEqual(['immigrant-1']);
  });

  test('3. A full household causes another suitable placement to be considered', () => {
    // Create full parent household (5 members)
    const parentHh = householdService.createHousehold(apartmentBuilding.id);
    for (let i = 1; i <= SettlementGenerator.HOUSEHOLD_CAPACITY; i++) {
      householdService.addMember(parentHh.id, `existing-member-${i}`);
    }
    expect(parentHh.members.length).toBe(5);

    const parent = createDummyCitizen('parent-full', 'Mother Full');
    parent.householdId = parentHh.id;
    parent.locationId = apartmentBuilding.id;
    parent.coordX = 520;
    parent.coordY = 530;

    const newborn = createDummyCitizen('baby-overflow', 'Baby Overflow');

    const result = placementService.assignNewborn(newborn, parent);

    expect(result.success).toBe(true);
    // Must NOT join the full household
    expect(result.householdId).not.toBe(parentHh.id);
    expect(result.isNewHousehold).toBe(true);
    expect(result.locationId).toBe(apartmentBuilding.id);
    expect(newborn.householdId).toBe(result.householdId);

    // The new household contains the newborn
    const newHh = householdService.getHousehold(result.householdId!);
    expect(newHh?.members).toEqual(['baby-overflow']);
    // Parent's household remains unchanged with 5 members
    expect(parentHh.members.length).toBe(5);
  });

  test('4. No available residential capacity produces an explicit, safe outcome without creating unlimited housing', () => {
    // Fill the apartment building to maximum capacity
    // Apartment citizen capacity = 500
    // Let's set building capacity to 2 to test capacity boundary
    apartmentBuilding.capacity = 2;
    const hh = householdService.createHousehold(apartmentBuilding.id);
    householdService.addMember(hh.id, 'occupant-1');
    householdService.addMember(hh.id, 'occupant-2');

    const immigrant = createDummyCitizen('immigrant-unhoused', 'Homeless Immigrant');

    const result = placementService.assignImmigrant(immigrant);

    expect(result.success).toBe(false);
    expect(result.reason).toBe('NO_RESIDENTIAL_CAPACITY');
    expect(immigrant.householdId).toBeUndefined();
    expect(immigrant.locationId).toBeNull();
    expect(immigrant.coordX).toBeUndefined();
    expect(immigrant.coordY).toBeUndefined();

    // No extra buildings or households were created
    expect(worldEngine.buildingManager.getAllBuildings().length).toBe(1);
    expect(householdService.getAllHouseholds().length).toBe(1);
  });

  test('5. Reprocessing the same lifecycle event is idempotent and does not create duplicate households', () => {
    const immigrant = createDummyCitizen('immigrant-retry', 'Retry Citizen');

    const result1 = placementService.assignImmigrant(immigrant, cityId);
    expect(result1.success).toBe(true);
    const assignedHhId = result1.householdId;
    const initialHhCount = householdService.getAllHouseholds().length;

    // Reprocess the same assignment
    const result2 = placementService.assignImmigrant(immigrant, cityId);
    expect(result2.success).toBe(true);
    expect(result2.householdId).toBe(assignedHhId);
    expect(result2.isNewHousehold).toBe(false);

    // Household count unchanged, member list contains citizen exactly once
    expect(householdService.getAllHouseholds().length).toBe(initialHhCount);
    const hh = householdService.getHousehold(assignedHhId!);
    expect(hh?.members.filter(id => id === 'immigrant-retry').length).toBe(1);
  });
});
