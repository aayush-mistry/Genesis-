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

  test('TEST 1: Real demographic lifecycle invocation places and persists a newborn', async () => {
    // 1. Create a parent citizen in the apartment building with an initial household
    const parentHh = citizenService.engine.householdService.createHousehold(apartmentBuildingId);
    parentHouseholdId = parentHh.id;

    const parent = citizenService.engine.createCitizen(
      CitizenGender.FEMALE,
      apartmentBuildingId,
      { year: -25, month: 1, day: 1, hour: 0, minute: 0, second: 0 },
      101,
      {
        householdId: parentHh.id,
        coordX: 1155,
        coordY: 1158
      }
    );
    parentCitizenId = parent.id;

    // Persist parent and initial household so DB has referential integrity
    await persistenceService.persistTickBoundary({
      citizens: [parent.id],
      households: [parentHh.id]
    });

    // Clear dirty collections before lifecycle invocation
    citizenService.getAndClearDirtyCollections();

    // 2. Trigger real demographic monthly tick through PopulationSimulator
    // Control Math.random so that for the parent, birth rate check passes
    const origRandom = Math.random;
    try {
      let callIndex = 0;
      Math.random = () => {
        callIndex++;
        // First random call in births loop: parent's birth check (< MONTHLY_BIRTH_RATE = 0.02/12)
        if (callIndex === 1) return 0.0001;
        // Subsequent calls: gender (> 0.5 = female), coordinate jitter, death check (> 0.1), migration (> 0.1)
        if (callIndex === 2) return 0.2; // Male newborn
        return 0.8; // No deaths, no migration
      };

      citizenService.simulator.processDemographics({
        year: 1,
        month: 2,
        day: 1,
        hour: 0,
        minute: 0,
        second: 0
      });
    } finally {
      Math.random = origRandom;
    }

    // 3. Demographic event tracking verification
    const dirty = citizenService.getAndClearDirtyCollections();
    expect(dirty.citizens.length).toBeGreaterThan(0);
    const bornCitizenId = dirty.citizens.find(id => id !== parentCitizenId) || dirty.citizens[0];
    newbornCitizenId = bornCitizenId;

    const inMemNewborn = citizenService.engine.getCitizen(bornCitizenId);
    expect(inMemNewborn).toBeDefined();
    expect(inMemNewborn?.householdId).toBe(parentHouseholdId);
    expect(inMemNewborn?.locationId).toBe(apartmentBuildingId);
    expect(inMemNewborn?.coordX).toBe(1155);
    expect(inMemNewborn?.coordY).toBe(1158);

    // 4. Persistence to SQLite
    await persistenceService.persistTickBoundary(dirty);

    const dbNewborn = await prisma.citizen.findUnique({
      where: { id: bornCitizenId }
    });
    expect(dbNewborn).toBeDefined();
    expect(dbNewborn?.householdId).toBe(parentHouseholdId);
    expect(dbNewborn?.locationId).toBe(apartmentBuildingId);
    expect(dbNewborn?.coordX).toBe(1155);
    expect(dbNewborn?.coordY).toBe(1158);

    const updatedHh = citizenService.engine.householdService.getHousehold(parentHouseholdId);
    expect(updatedHh?.members).toContain(bornCitizenId);
    expect(updatedHh?.members.length).toBe(2);
  });

  test('TEST 2: Real immigration lifecycle invocation places and persists an immigrant', async () => {
    // Clear dirty collections before invocation
    citizenService.getAndClearDirtyCollections();

    // Trigger real demographic lifecycle tick through PopulationSimulator with controlled migration
    const origRandom = Math.random;
    try {
      let callIndex = 0;
      Math.random = () => {
        callIndex++;
        // We have 2 citizens currently (parent and newborn)
        // Birth loop calls 1 & 2: return 0.99 (no births)
        if (callIndex === 1 || callIndex === 2) return 0.99;
        // Death loop calls 3 & 4: return 0.99 (no deaths)
        if (callIndex === 3 || callIndex === 4) return 0.99;
        // Migration loop call 5: return 0.0001 (< MONTHLY_MIGRATION_RATE = 0.005/12 -> triggers immigration!)
        if (callIndex === 5) return 0.0001;
        // Subsequent calls: gender, age, coordinate jitter
        return 0.5;
      };

      citizenService.simulator.processDemographics({
        year: 1,
        month: 3,
        day: 1,
        hour: 0,
        minute: 0,
        second: 0
      });
    } finally {
      Math.random = origRandom;
    }

    const dirty = citizenService.getAndClearDirtyCollections();
    expect(dirty.citizens.length).toBeGreaterThan(0);
    expect(dirty.households.length).toBeGreaterThan(0);

    const immId = dirty.citizens[0];
    immigrantCitizenId = immId;
    const immHhId = dirty.households[0];
    immigrantHouseholdId = immHhId;

    const inMemImm = citizenService.engine.getCitizen(immId);
    expect(inMemImm).toBeDefined();
    expect(inMemImm?.householdId).toBe(immHhId);
    expect(inMemImm?.locationId).toBe(apartmentBuildingId);
    // Inside building bounds [1130, 1170]
    expect(inMemImm?.coordX).toBeGreaterThanOrEqual(1130);
    expect(inMemImm?.coordX).toBeLessThanOrEqual(1170);
    expect(inMemImm?.coordY).toBeGreaterThanOrEqual(1130);
    expect(inMemImm?.coordY).toBeLessThanOrEqual(1170);

    // Persist to SQLite
    await persistenceService.persistTickBoundary(dirty);

    const dbImm = await prisma.citizen.findUnique({
      where: { id: immId }
    });
    expect(dbImm).toBeDefined();
    expect(dbImm?.householdId).toBe(immHhId);
    expect(dbImm?.locationId).toBe(apartmentBuildingId);

    const dbHh = await prisma.household.findUnique({
      where: { id: immHhId }
    });
    expect(dbHh).toBeDefined();
    expect(dbHh?.locationId).toBe(apartmentBuildingId);
  });

  test('TEST 3: Reprocessing the same lifecycle event does not duplicate citizens or households', async () => {
    const immCitizen = citizenService.engine.getCitizen(immigrantCitizenId);
    expect(immCitizen).toBeDefined();

    const hhCountBefore = citizenService.engine.householdService.getAllHouseholds().length;
    const citCountBefore = citizenService.engine.listCitizens().length;

    // Reprocess assignment on the already placed immigrant
    const reprocessResult = citizenService.engine.placementService.assignImmigrant(immCitizen!, cityId);
    expect(reprocessResult.success).toBe(true);
    expect(reprocessResult.householdId).toBe(immigrantHouseholdId);
    expect(reprocessResult.isNewHousehold).toBe(false);

    // Total in-memory households and citizens must not increase
    expect(citizenService.engine.householdService.getAllHouseholds().length).toBe(hhCountBefore);
    expect(citizenService.engine.listCitizens().length).toBe(citCountBefore);

    // Persist again
    await persistenceService.persistTickBoundary({
      citizens: [immigrantCitizenId],
      households: [immigrantHouseholdId]
    });

    // Verify DB counts remain strictly 1
    const dbHouseholds = await prisma.household.findMany({
      where: { id: immigrantHouseholdId }
    });
    expect(dbHouseholds.length).toBe(1);

    const dbCitizens = await prisma.citizen.findMany({
      where: { id: immigrantCitizenId }
    });
    expect(dbCitizens.length).toBe(1);
  });

  test('TEST 4: An unhoused citizen is assigned housing when suitable capacity later becomes available', async () => {
    // 1. Create an isolated settlement where residential capacity is strictly 1
    const isolatedHouse = worldService.engine.buildingManager.createBuilding({
      name: 'Solo Cottage',
      districtId: districtId,
      type: BuildingType.HOUSE,
      capacity: 1,
      coordinates: { x: 5000, y: 5000 },
      width: 20,
      height: 20,
      status: 'ACTIVE'
    });

    await prisma.building.create({
      data: {
        id: isolatedHouse.id,
        districtId: districtId,
        name: isolatedHouse.name,
        type: 'HOUSE',
        capacity: 1,
        status: 'ACTIVE',
        coordX: 5000,
        coordY: 5000,
        width: 20,
        height: 20
      }
    });

    // 2. Fill the house with an occupant
    const cottageHh = citizenService.engine.householdService.createHousehold(isolatedHouse.id);
    const soloOccupant = citizenService.engine.createCitizen(
      CitizenGender.MALE,
      isolatedHouse.id,
      { year: -40, month: 1, day: 1, hour: 0, minute: 0, second: 0 },
      501,
      { householdId: cottageHh.id, coordX: 5000, coordY: 5000 }
    );
    expect(cottageHh.members.length).toBe(1);

    await persistenceService.persistTickBoundary({
      citizens: [soloOccupant.id],
      households: [cottageHh.id]
    });

    // 3. An immigrant arrives preferring this house, but capacity is full in this house
    // Verify building occupancy
    const occBefore = citizenService.engine.placementService.getBuildingOccupancy(isolatedHouse.id);
    expect(occBefore.hasHouseholdCapacity).toBe(false);
    expect(occBefore.hasCitizenCapacity).toBe(false);

    // Create a new citizen with no placement
    const unhousedCitizen = citizenService.engine.createCitizen(
      CitizenGender.FEMALE,
      null,
      { year: -20, month: 1, day: 1, hour: 0, minute: 0, second: 0 },
      502,
      { skipHouseholdCreation: true }
    );
    unhousedCitizen.locationId = isolatedHouse.id;

    // Isolate placement service specifically to this isolated house to test lack of capacity
    const isolatedPlacementService = new (require('@genesis/engine').HouseholdPlacementService)(
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

    const failedResult = isolatedPlacementService.assignImmigrant(unhousedCitizen, isolatedHouse.id);
    expect(failedResult.success).toBe(false);
    expect(failedResult.reason).toBe('NO_RESIDENTIAL_CAPACITY');
    expect(unhousedCitizen.householdId).toBeUndefined();

    // Register into main placement service unhoused queue
    citizenService.engine.placementService.trackUnhoused(unhousedCitizen.id);
    expect(citizenService.engine.placementService.getUnhousedCitizenIds()).toContain(unhousedCitizen.id);

    // Persist unhoused citizen to SQLite
    await persistenceService.persistTickBoundary({
      citizens: [unhousedCitizen.id]
    });
    const dbUnhoused = await prisma.citizen.findUnique({ where: { id: unhousedCitizen.id } });
    expect(dbUnhoused?.householdId).toBeNull();

    // 4. Capacity becomes available: The solo occupant passes away (DECEASED)
    citizenService.engine.updateStatus(soloOccupant.id, CitizenStatus.DECEASED);

    // Verification: deceased citizen was removed, empty household was pruned
    expect(cottageHh.members.length).toBe(0);
    expect(citizenService.engine.householdService.getHousehold(cottageHh.id)).toBeUndefined();

    const occAfter = citizenService.engine.placementService.getBuildingOccupancy(isolatedHouse.id);
    expect(occAfter.hasHouseholdCapacity).toBe(true);

    // 5. Retry unhoused placements
    const placedCitizens = citizenService.engine.retryUnhousedPlacements();
    expect(placedCitizens.length).toBe(1);
    expect(placedCitizens[0].id).toBe(unhousedCitizen.id);
    expect(unhousedCitizen.householdId).toBeDefined();
    expect(unhousedCitizen.locationId).toBeDefined();
    expect(citizenService.engine.placementService.getUnhousedCitizenIds()).not.toContain(unhousedCitizen.id);

    // 6. Persist newly placed citizen and their new household
    const placedHh = citizenService.engine.householdService.getHousehold(unhousedCitizen.householdId!);
    expect(placedHh).toBeDefined();
    await persistenceService.persistTickBoundary({
      citizens: [unhousedCitizen.id],
      households: [placedHh!.id]
    });

    const dbPlaced = await prisma.citizen.findUnique({ where: { id: unhousedCitizen.id } });
    expect(dbPlaced?.householdId).toBe(placedHh!.id);
  });

  test('TEST 5: A citizen who already has valid housing is not relocated by a retry', async () => {
    const parent = citizenService.engine.getCitizen(parentCitizenId)!;
    expect(parent.householdId).toBe(parentHouseholdId);
    const origCoordX = parent.coordX;
    const origCoordY = parent.coordY;

    // Run retryUnhousedPlacements
    const retryPlaced = citizenService.engine.retryUnhousedPlacements();

    // Parent was already housed, so was not in unhoused queue and is not returned
    expect(retryPlaced.some(c => c.id === parentCitizenId)).toBe(false);

    // Verification: housing, location, and coordinates remain strictly unchanged
    expect(parent.householdId).toBe(parentHouseholdId);
    expect(parent.locationId).toBe(apartmentBuildingId);
    expect(parent.coordX).toBe(origCoordX);
    expect(parent.coordY).toBe(origCoordY);
  });

  test('TEST 6: Household and building capacity limits are strictly respected', async () => {
    // 1. Household member capacity limit: strictly <= 5 members
    const testHh = citizenService.engine.householdService.createHousehold(apartmentBuildingId);
    for (let i = 1; i <= 4; i++) {
      citizenService.engine.householdService.addMember(testHh.id, `member-${i}`);
    }

    const testParent = citizenService.engine.createCitizen(
      CitizenGender.FEMALE,
      apartmentBuildingId,
      { year: -30, month: 1, day: 1, hour: 0, minute: 0, second: 0 },
      701,
      { householdId: testHh.id, coordX: 1150, coordY: 1150 }
    );
    expect(testHh.members.length).toBe(5);

    // Newborn cannot join full household (5 members)
    const testNewborn = citizenService.engine.createCitizen(
      CitizenGender.FEMALE,
      null,
      { year: 1, month: 1, day: 1, hour: 0, minute: 0, second: 0 },
      702,
      { skipHouseholdCreation: true }
    );

    const res = citizenService.engine.placementService.assignNewborn(testNewborn, testParent);
    // Newborn cannot join the full testHh
    expect(res.householdId).not.toBe(testHh.id);
    expect(testHh.members.length).toBe(5);

    // 2. House building capacity limits
    const smallHouse = worldService.engine.buildingManager.createBuilding({
      name: 'Small House',
      districtId: districtId,
      type: BuildingType.HOUSE,
      capacity: 3,
      coordinates: { x: 1200, y: 1200 },
      width: 10,
      height: 10,
      status: 'ACTIVE'
    });
    const limits = citizenService.engine.placementService.getBuildingCapacityLimits(smallHouse);
    expect(limits.householdCapacity).toBe(1);
    expect(limits.citizenCapacity).toBe(3);

    // 3. Apartment building capacity limits
    const aptLimits = citizenService.engine.placementService.getBuildingCapacityLimits(apartmentBuilding);
    expect(aptLimits.householdCapacity).toBe(SettlementGenerator.APARTMENT_HOUSEHOLD_CAPACITY); // 100
    expect(aptLimits.citizenCapacity).toBe(500);
  });

  test('TEST 7: A cold restart preserves both housed citizens and legitimately unhoused citizens', async () => {
    // 1. Create and persist a legitimately unhoused citizen
    const legitimatelyUnhoused = citizenService.engine.createCitizen(
      CitizenGender.MALE,
      null,
      { year: -22, month: 6, day: 1, hour: 0, minute: 0, second: 0 },
      801,
      { skipHouseholdCreation: true }
    );
    expect(legitimatelyUnhoused.householdId).toBeUndefined();
    citizenService.engine.placementService.trackUnhoused(legitimatelyUnhoused.id);

    await persistenceService.persistTickBoundary({
      citizens: [immigrantCitizenId, legitimatelyUnhoused.id]
    });

    const preImm = citizenService.engine.getCitizen(immigrantCitizenId)!;
    const preHhId = preImm.householdId;
    const preCoordX = preImm.coordX;
    const preCoordY = preImm.coordY;

    // 2. Simulate Cold Restart: Clear in-memory engines
    citizenService.engine.clear();
    expect(citizenService.engine.listCitizens().length).toBe(0);
    expect(citizenService.engine.householdService.getAllHouseholds().length).toBe(0);
    expect(citizenService.engine.placementService.getUnhousedCitizenIds().length).toBe(0);

    // 3. Bootstrap engines from database
    await persistenceService.bootstrap();

    // 4. Verify housed citizen hydrated accurately without relocation
    const postImm = citizenService.engine.getCitizen(immigrantCitizenId);
    expect(postImm).toBeDefined();
    expect(postImm?.householdId).toBe(preHhId);
    expect(postImm?.locationId).toBe(apartmentBuildingId);
    expect(postImm?.coordX).toBeCloseTo(preCoordX!, 4);
    expect(postImm?.coordY).toBeCloseTo(preCoordY!, 4);

    const postHh = citizenService.engine.householdService.getHousehold(preHhId!);
    expect(postHh).toBeDefined();
    expect(postHh?.members).toContain(immigrantCitizenId);

    // 5. Verify legitimately unhoused citizen is preserved, active, and tracked in unhoused queue
    const postUnhoused = citizenService.engine.getCitizen(legitimatelyUnhoused.id);
    expect(postUnhoused).toBeDefined();
    expect(postUnhoused?.householdId).toBeUndefined();
    expect(postUnhoused?.status).toBe(CitizenStatus.ACTIVE);
    expect(citizenService.engine.placementService.getUnhousedCitizenIds()).toContain(legitimatelyUnhoused.id);
  });
});
