import { prisma } from '../../repositories/prisma';
import { worldService } from '../../services/world.service';
import { citizenService } from '../../services/citizen.service';
import { persistenceService } from '../../services/persistence.service';
import { CitizenGender, CitizenStatus, BuildingType, DistrictType } from '@genesis/shared';
import { SettlementGenerator } from '@genesis/engine';

describe('T8.1 — Dynamic Household Formation and Residential Placement', () => {
  jest.setTimeout(60000);

  const testSuffix = `t81-${Date.now()}`;
  let worldId: string;
  let regionId: string;
  let cityId: string;
  let districtId: string;
  let apartmentBuildingId: string;
  let apartmentBuilding: any;

  beforeAll(async () => {
    // 1. Clean DB tables
    await prisma.transactionRecord.deleteMany({});
    await prisma.shipment.deleteMany({});
    await prisma.order.deleteMany({});
    await prisma.inventoryItem.deleteMany({});
    await prisma.inventory.deleteMany({});
    await prisma.jobPosition.deleteMany({});
    await prisma.citizen.deleteMany({});
    await prisma.workplace.deleteMany({});
    await prisma.wallet.deleteMany({});
    await prisma.household.deleteMany({});
    await prisma.building.deleteMany({});
    await prisma.district.deleteMany({});
    await prisma.city.deleteMany({});
    await prisma.region.deleteMany({});
    await prisma.world.deleteMany({});

    // 2. Setup World in Prisma
    const world = await prisma.world.create({
      data: {
        name: `Dynamic Placement World ${testSuffix}`,
        description: 'T8.1 Dynamic Placement Test World',
        randomSeed: 8181,
        creationTime: 0,
        worldSize: 2000,
        climateProfile: 'TEMPERATE',
        timeZone: 'UTC',
        version: '1.0',
        status: 'ACTIVE'
      }
    });
    worldId = world.id;

    const region = await prisma.region.create({
      data: {
        worldId: world.id,
        name: `Region ${testSuffix}`,
        climate: 'TEMPERATE',
        description: 'Test Region',
        population: 0,
        coordX: 0,
        coordY: 0,
        width: 10000,
        height: 10000
      }
    });
    regionId = region.id;

    const city = await prisma.city.create({
      data: {
        regionId: region.id,
        name: `City ${testSuffix}`,
        population: 0,
        area: 250000,
        coordX: 1000,
        coordY: 1000,
        width: 2000,
        height: 2000
      }
    });
    cityId = city.id;

    const district = await prisma.district.create({
      data: {
        cityId: city.id,
        name: `Residential District ${testSuffix}`,
        type: 'RESIDENTIAL',
        area: 50000,
        coordX: 1100,
        coordY: 1100,
        width: 500,
        height: 500
      }
    });
    districtId = district.id;

    const building = await prisma.building.create({
      data: {
        districtId: district.id,
        name: `Apartment Complex ${testSuffix}`,
        type: 'APARTMENT',
        capacity: 500,
        status: 'ACTIVE',
        coordX: 1150,
        coordY: 1150,
        width: 40,
        height: 40
      }
    });
    apartmentBuildingId = building.id;
    apartmentBuilding = building;

    // 3. Hydrate WorldEngine in memory
    worldService.engine.worldManager.loadWorld({
      id: world.id,
      name: world.name,
      description: world.description,
      creationTime: 0,
      currentPopulation: 0,
      worldSize: 2000,
      width: 10000,
      height: 10000,
      climateProfile: 'TEMPERATE',
      timeZone: 'UTC',
      version: '1.0',
      status: 'ACTIVE',
      regionIds: [region.id],
      createdAt: new Date(),
      updatedAt: new Date()
    });

    (worldService.engine.regionManager as any).regions.set(region.id, {
      id: region.id,
      worldId: world.id,
      name: region.name,
      description: region.description,
      climate: region.climate,
      population: 0,
      coordinates: { x: 0, y: 0 },
      width: 10000,
      height: 10000,
      cityIds: [city.id],
      createdAt: new Date(),
      updatedAt: new Date()
    });

    (worldService.engine.cityManager as any).cities.set(city.id, {
      id: city.id,
      name: city.name,
      regionId: region.id,
      population: 0,
      coordinates: { x: 1000, y: 1000 },
      width: 2000,
      height: 2000,
      districtIds: [district.id],
      createdAt: new Date(),
      updatedAt: new Date()
    });

    (worldService.engine.districtManager as any).districts.set(district.id, {
      id: district.id,
      name: district.name,
      cityId: city.id,
      type: DistrictType.RESIDENTIAL,
      coordinates: { x: 1100, y: 1100 },
      width: 500,
      height: 500,
      buildingIds: [building.id],
      createdAt: new Date(),
      updatedAt: new Date()
    });

    (worldService.engine.buildingManager as any).buildings.set(building.id, {
      id: building.id,
      name: building.name,
      districtId: district.id,
      type: BuildingType.APARTMENT,
      capacity: 500,
      coordinates: { x: 1150, y: 1150 },
      width: 40,
      height: 40,
      status: 'ACTIVE',
      roomIds: [],
      createdAt: new Date(),
      updatedAt: new Date()
    });

    // Also update simulation state singleton so bootstrap can recover worldId
    const { timeService } = await import('../../services/time.service');
    const { simulationRepository } = await import('../../repositories');
    await simulationRepository.upsertSimulationState(
      timeService.engine.getCurrentTime(),
      timeService.engine.getSpeed(),
      world.id
    );
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  let immigrantCitizenId: string;
  let immigrantHouseholdId: string;
  let newbornCitizenId: string;
  let parentCitizenId: string;
  let parentHouseholdId: string;

  test('TEST 1: Newborn joins its existing household when capacity permits', async () => {
    // 1. Create parent in an existing household with available capacity (1 member < 5)
    const parentHh = citizenService.engine.householdService.createHousehold(apartmentBuildingId);
    parentHouseholdId = parentHh.id;

    const parent = citizenService.engine.createCitizen(
      CitizenGender.FEMALE,
      apartmentBuildingId,
      { year: 0, month: 1, day: 1, hour: 0, minute: 0, second: 0 },
      101,
      {
        householdId: parentHh.id,
        coordX: 1155,
        coordY: 1158
      }
    );
    parentCitizenId = parent.id;

    expect(parent.householdId).toBe(parentHh.id);
    expect(parent.coordX).toBe(1155);
    expect(parent.coordY).toBe(1158);

    const initialHh = citizenService.engine.householdService.getHousehold(parentHh.id);
    expect(initialHh?.members.length).toBe(1);

    // 2. Birth of newborn
    const newborn = citizenService.engine.createCitizenForNewborn(
      CitizenGender.MALE,
      parent,
      { year: 1, month: 2, day: 1, hour: 10, minute: 0, second: 0 }
    );
    newbornCitizenId = newborn.id;

    // 3. Assertions
    expect(newborn.householdId).toBe(parentHh.id);
    expect(newborn.locationId).toBe(apartmentBuildingId);
    expect(newborn.coordX).toBe(parent.coordX);
    expect(newborn.coordY).toBe(parent.coordY);

    const updatedHh = citizenService.engine.householdService.getHousehold(parentHh.id);
    expect(updatedHh?.members).toContain(newborn.id);
    expect(updatedHh?.members.length).toBe(2);
  });

  test('TEST 2: Immigrant receives suitable residential placement with intentional coordinates', async () => {
    const immigrant = citizenService.engine.createCitizenForImmigrant(
      CitizenGender.FEMALE,
      { year: -25, month: 5, day: 10, hour: 0, minute: 0, second: 0 },
      cityId
    );
    immigrantCitizenId = immigrant.id;
    immigrantHouseholdId = immigrant.householdId!;

    expect(immigrant.householdId).toBeDefined();
    expect(immigrant.householdId).not.toBe(parentHouseholdId);
    expect(immigrant.locationId).toBe(apartmentBuildingId);

    // Immigrant coordinates must be strictly inside the apartment building bounding box
    // Center is (1150, 1150), width = 40, height = 40 -> [1130, 1170]
    expect(immigrant.coordX).toBeGreaterThanOrEqual(1130);
    expect(immigrant.coordX).toBeLessThanOrEqual(1170);
    expect(immigrant.coordY).toBeGreaterThanOrEqual(1130);
    expect(immigrant.coordY).toBeLessThanOrEqual(1170);

    // Never default to 0,0
    expect(immigrant.coordX).not.toBe(0);
    expect(immigrant.coordY).not.toBe(0);

    const immHh = citizenService.engine.householdService.getHousehold(immigrantHouseholdId);
    expect(immHh).toBeDefined();
    expect(immHh?.members).toEqual([immigrant.id]);
  });

  test('TEST 3: A full household causes another suitable placement to be considered', async () => {
    // 1. Create a parent whose household is completely full (5 members)
    const fullHh = citizenService.engine.householdService.createHousehold(apartmentBuildingId);
    for (let i = 1; i <= SettlementGenerator.HOUSEHOLD_CAPACITY - 1; i++) {
      citizenService.engine.householdService.addMember(fullHh.id, `full-member-${i}`);
    }

    const fullParent = citizenService.engine.createCitizen(
      CitizenGender.FEMALE,
      apartmentBuildingId,
      { year: -30, month: 1, day: 1, hour: 0, minute: 0, second: 0 },
      202,
      {
        householdId: fullHh.id,
        coordX: 1145,
        coordY: 1145
      }
    );
    expect(fullHh.members.length).toBe(5);

    // 2. Birth of newborn from this full household
    const overflowNewborn = citizenService.engine.createCitizenForNewborn(
      CitizenGender.FEMALE,
      fullParent,
      { year: 1, month: 3, day: 1, hour: 8, minute: 0, second: 0 }
    );

    // 3. Assertions
    // Newborn must NOT join the full household
    expect(overflowNewborn.householdId).not.toBe(fullHh.id);
    expect(overflowNewborn.householdId).toBeDefined();
    expect(overflowNewborn.locationId).toBe(apartmentBuildingId);

    // Full household remains with exactly 5 members
    expect(fullHh.members.length).toBe(5);

    // Newborn's new household has only this newborn
    const newHh = citizenService.engine.householdService.getHousehold(overflowNewborn.householdId!);
    expect(newHh?.members).toEqual([overflowNewborn.id]);
  });

  test('TEST 4: No available residential capacity produces an explicit, safe outcome without creating unlimited housing', async () => {
    // 1. Create an isolated city with a single small house of capacity 1
    const isolatedHouse = worldService.engine.buildingManager.createBuilding({
      name: 'Full House',
      districtId: districtId,
      type: BuildingType.HOUSE,
      capacity: 1,
      coordinates: { x: 3000, y: 3000 },
      width: 10,
      height: 10,
      status: 'ACTIVE'
    });

    // Fill this house
    const houseHh = citizenService.engine.householdService.createHousehold(isolatedHouse.id);
    citizenService.engine.householdService.addMember(houseHh.id, 'occupant-solo');

    // Create a temporary placement service that only knows about this full house
    const mockPlacementService = new (require('@genesis/engine').HouseholdPlacementService)(
      {
        buildingManager: {
          getAllBuildings: () => [isolatedHouse],
          getBuilding: (id: string) => (id === isolatedHouse.id ? isolatedHouse : undefined)
        },
        districtManager: worldService.engine.districtManager,
        cityManager: worldService.engine.cityManager
      },
      citizenService.engine.householdService
    );

    const unhousedCitizen = {
      id: `unhoused-${Date.now()}`,
      name: 'No Housing Citizen',
      gender: CitizenGender.MALE,
      status: CitizenStatus.ACTIVE,
      birthDate: { year: 0, month: 1, day: 1, hour: 0, minute: 0, second: 0 },
      createdAt: { year: 1, month: 1, day: 1, hour: 0, minute: 0, second: 0 },
      locationId: null,
      vitalState: {} as any,
      personality: {} as any,
      movementState: 'IDLE' as any,
      activeRoute: null,
      skills: [],
      employmentStatus: 'UNEMPLOYED' as any,
      workplaceId: null,
      jobType: null,
      jobSchedule: null,
      wallet: {} as any
    };

    const placementResult = mockPlacementService.assignImmigrant(unhousedCitizen as any);

    expect(placementResult.success).toBe(false);
    expect(placementResult.reason).toBe('NO_RESIDENTIAL_CAPACITY');
    expect(unhousedCitizen.householdId).toBeUndefined();
    expect(unhousedCitizen.locationId).toBeNull();
    expect((unhousedCitizen as any).coordX).toBeUndefined();
    expect((unhousedCitizen as any).coordY).toBeUndefined();
  });

  test('TEST 5: New household and citizen relationships persist correctly to SQLite', async () => {
    // Call persistTickBoundary with newborn and immigrant
    await persistenceService.persistTickBoundary({
      citizens: [immigrantCitizenId, newbornCitizenId]
    });

    // 1. Verify immigrant household was created in SQLite DB
    const dbImmHh = await prisma.household.findUnique({
      where: { id: immigrantHouseholdId }
    });
    expect(dbImmHh).toBeDefined();
    expect(dbImmHh?.locationId).toBe(apartmentBuildingId);

    // 2. Verify immigrant citizen in SQLite DB
    const dbImm = await prisma.citizen.findUnique({
      where: { id: immigrantCitizenId }
    });
    expect(dbImm).toBeDefined();
    expect(dbImm?.householdId).toBe(immigrantHouseholdId);
    expect(dbImm?.locationId).toBe(apartmentBuildingId);
    expect(dbImm?.coordX).toBeDefined();
    expect(dbImm?.coordX).not.toBe(0);
    expect(dbImm?.coordY).toBeDefined();
    expect(dbImm?.coordY).not.toBe(0);

    // 3. Verify newborn citizen in SQLite DB
    const dbNewborn = await prisma.citizen.findUnique({
      where: { id: newbornCitizenId }
    });
    expect(dbNewborn).toBeDefined();
    expect(dbNewborn?.householdId).toBe(parentHouseholdId);
    expect(dbNewborn?.locationId).toBe(apartmentBuildingId);
  });

  test('TEST 6: Reprocessing the same lifecycle event does not create duplicate households or assignments', async () => {
    const immCitizen = citizenService.engine.getCitizen(immigrantCitizenId);
    expect(immCitizen).toBeDefined();

    const hhCountBefore = citizenService.engine.householdService.getAllHouseholds().length;

    // Reprocess assignment on the already placed immigrant
    const reprocessResult = citizenService.engine.placementService.assignImmigrant(immCitizen!, cityId);
    expect(reprocessResult.success).toBe(true);
    expect(reprocessResult.householdId).toBe(immigrantHouseholdId);
    expect(reprocessResult.isNewHousehold).toBe(false);

    // Total in-memory households must not increase
    const hhCountAfter = citizenService.engine.householdService.getAllHouseholds().length;
    expect(hhCountAfter).toBe(hhCountBefore);

    // Persist again
    await persistenceService.persistTickBoundary({
      citizens: [immigrantCitizenId]
    });

    // Verify DB count
    const dbHouseholds = await prisma.household.findMany({
      where: { id: immigrantHouseholdId }
    });
    expect(dbHouseholds.length).toBe(1);

    const dbCitizens = await prisma.citizen.findMany({
      where: { id: immigrantCitizenId }
    });
    expect(dbCitizens.length).toBe(1);
  });

  test('TEST 7: A cold restart preserves household relationships and spatial placement without relocation', async () => {
    // Record expected state prior to shutdown
    const preCit = citizenService.engine.getCitizen(immigrantCitizenId)!;
    const preCoordX = preCit.coordX;
    const preCoordY = preCit.coordY;
    const preHhId = preCit.householdId;

    // Simulate Cold Restart: Clear in-memory engines
    citizenService.engine.clear();
    expect(citizenService.engine.listCitizens().length).toBe(0);
    expect(citizenService.engine.householdService.getAllHouseholds().length).toBe(0);

    // Bootstrap engines from database
    await persistenceService.bootstrap();

    // Verify immigrant citizen hydrated accurately
    const postCit = citizenService.engine.getCitizen(immigrantCitizenId);
    expect(postCit).toBeDefined();
    expect(postCit?.householdId).toBe(preHhId);
    expect(postCit?.locationId).toBe(apartmentBuildingId);
    expect(postCit?.coordX).toBeCloseTo(preCoordX!, 4);
    expect(postCit?.coordY).toBeCloseTo(preCoordY!, 4);

    // Verify household hydrated in HouseholdService
    const postHh = citizenService.engine.householdService.getHousehold(preHhId!);
    expect(postHh).toBeDefined();
    expect(postHh?.locationId).toBe(apartmentBuildingId);
    expect(postHh?.members).toContain(immigrantCitizenId);
  });
});
