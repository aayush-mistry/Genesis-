import { prisma } from '../../repositories/prisma';
import { worldService } from '../../services/world.service';
import { citizenService } from '../../services/citizen.service';
import { persistenceService } from '../../services/persistence.service';
import { civilizationIntelligenceService } from '../../services/civilizationIntelligence.service';
import { CitizenGender, CitizenStatus, EmploymentStatus, WorkplaceType } from '@genesis/shared';

describe('T7.9 — Population Lifecycle & Spatial State Integrity', () => {
  jest.setTimeout(60000);

  const testSuffix = `t79-${Date.now()}`;
  let worldId: string;
  let regionId: string;
  let workplaceId: string;
  let citizenAliveId: string;
  let citizenDeceasedId: string;
  let citizenNewbornId: string;

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

    // 2. Create World, Region, City, District, Building
    const world = await prisma.world.create({
      data: {
        name: `Lifecycle World ${testSuffix}`,
        description: 'T7.9 Lifecycle Test World',
        randomSeed: 79,
        creationTime: 0,
        worldSize: 1000,
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
        description: 'Region for lifecycle test',
        population: 2,
        coordX: 0,
        coordY: 0,
        width: 5000,
        height: 5000
      }
    });
    regionId = region.id;

    const city = await prisma.city.create({
      data: {
        regionId: region.id,
        name: `City ${testSuffix}`,
        population: 2,
        area: 10000,
        coordX: 100,
        coordY: 100,
        width: 1000,
        height: 1000
      }
    });

    const district = await prisma.district.create({
      data: {
        cityId: city.id,
        name: `District ${testSuffix}`,
        type: 'RESIDENTIAL',
        area: 2500,
        coordX: 150,
        coordY: 150,
        width: 500,
        height: 500
      }
    });

    const building = await prisma.building.create({
      data: {
        districtId: district.id,
        name: `Building ${testSuffix}`,
        type: 'APARTMENT',
        capacity: 10,
        status: 'ACTIVE',
        coordX: 160,
        coordY: 160,
        width: 50,
        height: 50
      }
    });

    // 3. Create Workplace with job position
    const wp = await prisma.workplace.create({
      data: {
        type: WorkplaceType.FARM,
        locationId: building.id,
        regionId: region.id,
        capacity: 5,
        occupiedPositions: 1,
        vacancies: 4,
        revenue: 0,
        expenses: 0,
        profit: 0
      }
    });
    workplaceId = wp.id;

    // Load into WorldEngine
    worldService.engine.worldManager.loadWorld({
      id: world.id,
      name: world.name,
      description: world.description,
      creationTime: 0,
      currentPopulation: 2,
      worldSize: 1000,
      width: 5000,
      height: 5000,
      climateProfile: 'TEMPERATE',
      timeZone: 'UTC',
      version: '1.0',
      status: 'ACTIVE',
      regionIds: [region.id],
      createdAt: new Date(),
      updatedAt: new Date()
    });

    const rObj = {
      id: region.id,
      worldId: world.id,
      name: region.name,
      description: region.description,
      climate: region.climate,
      population: 2,
      coordinates: { x: 0, y: 0 },
      width: 5000,
      height: 5000,
      cityIds: [city.id],
      createdAt: new Date(),
      updatedAt: new Date()
    };
    (worldService.engine.regionManager as any).regions.set(region.id, rObj);

    worldService.engine.workplaceRepository.create({
      id: wp.id,
      type: wp.type as any,
      locationId: wp.locationId,
      regionId: wp.regionId,
      capacity: 5,
      occupiedPositions: 1,
      vacancies: 4,
      revenue: 0,
      expenses: 0,
      profit: 0,
      positions: [
        { id: `pos-${wp.id}-1`, workplaceId: wp.id, title: 'Worker', occupantId: `cit-alive-${testSuffix}` }
      ]
    });

    // 4. Create Citizens in engine
    citizenAliveId = `cit-alive-${testSuffix}`;
    citizenDeceasedId = `cit-dec-${testSuffix}`;
    citizenNewbornId = `cit-newborn-${testSuffix}`;

    const simTime = { year: 1, month: 1, day: 1, hour: 8, minute: 0, second: 0 };

    // Citizen 1: Active, Employed
    const c1: any = {
      id: citizenAliveId,
      name: 'Alive Citizen',
      gender: CitizenGender.MALE,
      status: CitizenStatus.ACTIVE,
      createdAt: simTime,
      birthDate: { year: 0, month: 1, day: 1, hour: 0, minute: 0, second: 0 },
      locationId: building.id,
      coordX: 165,
      coordY: 175,
      vitalState: { hunger: 20, thirst: 10, energy: 90, health: 100, lastUpdatedSimulationTime: simTime },
      personality: { priceSensitivity: 50, qualityPreference: 50, conveniencePreference: 50, planningTendency: 50, socialEngagement: 50, riskTolerance: 50, savingTendency: 50 },
      movementState: 'IDLE',
      activeRoute: null,
      skills: [],
      employmentStatus: EmploymentStatus.EMPLOYED,
      workplaceId: wp.id,
      jobType: 'FARMER',
      jobSchedule: null,
      householdId: `hh-${testSuffix}`
    };
    (citizenService.engine as any).repository.create(c1);

    // Citizen 2: Deceased
    const c2: any = {
      id: citizenDeceasedId,
      name: 'Deceased Citizen',
      gender: CitizenGender.FEMALE,
      status: CitizenStatus.DECEASED,
      createdAt: simTime,
      birthDate: { year: -50, month: 1, day: 1, hour: 0, minute: 0, second: 0 },
      locationId: building.id,
      coordX: 160,
      coordY: 160,
      vitalState: { hunger: 100, thirst: 100, energy: 0, health: 0, lastUpdatedSimulationTime: simTime },
      personality: { priceSensitivity: 50, qualityPreference: 50, conveniencePreference: 50, planningTendency: 50, socialEngagement: 50, riskTolerance: 50, savingTendency: 50 },
      movementState: 'IDLE',
      activeRoute: null,
      skills: [],
      employmentStatus: EmploymentStatus.UNEMPLOYED,
      workplaceId: null,
      jobType: null,
      jobSchedule: null,
      householdId: `hh-${testSuffix}`
    };
    (citizenService.engine as any).repository.create(c2);

    await prisma.household.create({
      data: {
        id: `hh-${testSuffix}`,
        locationId: building.id,
        inventoryId: `inv-hh-${testSuffix}`,
        walletId: `wallet-hh-${testSuffix}`
      }
    });

    // Persist in DB
    await prisma.citizen.create({
      data: {
        id: c1.id,
        name: c1.name,
        gender: c1.gender,
        status: c1.status,
        locationId: c1.locationId,
        coordX: c1.coordX,
        coordY: c1.coordY,
        birthDateJson: JSON.stringify(c1.birthDate),
        createdAtSimJson: JSON.stringify(c1.createdAt),
        vitalStateJson: JSON.stringify(c1.vitalState),
        personalityJson: JSON.stringify(c1.personality),
        movementState: c1.movementState,
        skillsJson: '[]',
        employmentStatus: c1.employmentStatus,
        workplaceId: c1.workplaceId,
        jobType: c1.jobType,
        householdId: c1.householdId
      }
    });

    await prisma.citizen.create({
      data: {
        id: c2.id,
        name: c2.name,
        gender: c2.gender,
        status: c2.status,
        locationId: c2.locationId,
        coordX: c2.coordX,
        coordY: c2.coordY,
        birthDateJson: JSON.stringify(c2.birthDate),
        createdAtSimJson: JSON.stringify(c2.createdAt),
        vitalStateJson: JSON.stringify(c2.vitalState),
        personalityJson: JSON.stringify(c2.personality),
        movementState: c2.movementState,
        skillsJson: '[]',
        employmentStatus: c2.employmentStatus,
        workplaceId: c2.workplaceId,
        jobType: c2.jobType,
        householdId: c2.householdId
      }
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  test('TEST 1: Citizen spatial coordinates hydrate correctly into in-memory engine', async () => {
    // Check that citizenService has the exact coordinates hydrated
    const cit = citizenService.engine.getCitizen(citizenAliveId);
    expect(cit).toBeDefined();
    expect(cit?.coordX).toBe(165);
    expect(cit?.coordY).toBe(175);
    expect(cit?.status).toBe(CitizenStatus.ACTIVE);
  });

  test('TEST 2: Citizen Death lifecycle updates employment, vacancies, and population counts consistently', async () => {
    const cit = citizenService.engine.getCitizen(citizenAliveId);
    expect(cit).toBeDefined();
    expect(cit?.workplaceId).toBe(workplaceId);

    const wpBefore = worldService.engine.workplaceRepository.findById(workplaceId);
    expect(wpBefore?.occupiedPositions).toBe(1);
    expect(wpBefore?.vacancies).toBe(4);

    // Trigger death
    citizenService.engine.updateStatus(citizenAliveId, CitizenStatus.DECEASED);

    const citAfter = citizenService.engine.getCitizen(citizenAliveId);
    expect(citAfter?.status).toBe(CitizenStatus.DECEASED);
    expect(citAfter?.employmentStatus).toBe(EmploymentStatus.UNEMPLOYED);
    expect(citAfter?.workplaceId).toBeNull();

    // Verify workplace position released
    const wpAfter = worldService.engine.workplaceRepository.findById(workplaceId);
    expect(wpAfter?.occupiedPositions).toBe(0);
    expect(wpAfter?.vacancies).toBe(5);
    const pos = wpAfter?.positions.find(p => p.id === `pos-${wpAfter.id}-1`);
    expect(pos?.occupantId).toBeNull();
  });

  test('TEST 3: Newborn / Immigrant Citizen is persisted to SQLite via persistTickBoundary', async () => {
    const simTime = { year: 1, month: 1, day: 2, hour: 12, minute: 0, second: 0 };
    const newborn = {
      id: citizenNewbornId,
      name: 'Baby Genesis',
      gender: CitizenGender.FEMALE,
      status: CitizenStatus.ACTIVE,
      createdAt: simTime,
      birthDate: simTime,
      locationId: `loc-${testSuffix}`,
      coordX: 300,
      coordY: 400,
      vitalState: { hunger: 0, thirst: 0, energy: 100, health: 100, lastUpdatedSimulationTime: simTime },
      personality: { priceSensitivity: 40, qualityPreference: 60, conveniencePreference: 50, planningTendency: 50, socialEngagement: 50, riskTolerance: 50, savingTendency: 50 },
      movementState: 'IDLE',
      activeRoute: null,
      skills: [],
      employmentStatus: EmploymentStatus.UNEMPLOYED,
      workplaceId: null,
      jobType: null,
      jobSchedule: null,
      householdId: `hh-new-${testSuffix}`
    };

    (citizenService.engine as any).repository.create(newborn);

    // Call persistTickBoundary with dirty collection containing citizenNewbornId and citizenAliveId
    await persistenceService.persistTickBoundary({
      citizens: [citizenNewbornId, citizenAliveId]
    });

    // Verify newborn was created in SQLite DB
    const dbNewborn = await prisma.citizen.findUnique({
      where: { id: citizenNewbornId }
    });
    expect(dbNewborn).toBeDefined();
    expect(dbNewborn?.name).toBe('Baby Genesis');
    expect(dbNewborn?.status).toBe('ACTIVE');
    expect(dbNewborn?.coordX).toBe(300);
    expect(dbNewborn?.coordY).toBe(400);

    // Verify updated status of citizenAliveId in SQLite
    const dbAlive = await prisma.citizen.findUnique({
      where: { id: citizenAliveId }
    });
    expect(dbAlive?.status).toBe('DECEASED');
    expect(dbAlive?.employmentStatus).toBe('UNEMPLOYED');
    expect(dbAlive?.workplaceId).toBeNull();
  });

  test('TEST 4: Civilization Intelligence correctly separates active population from deceased', async () => {
    const summary = await civilizationIntelligenceService.getCivilizationSummary();
    // In our DB, we have 1 deceased (citizenAliveId became DECEASED), 1 deceased (c2), and 1 ACTIVE (citizenNewbornId)
    expect(summary.population.total).toBe(1); // Only ACTIVE citizens count in population.total
    expect(summary.employment.unemployed).toBe(1);
    expect(summary.employment.employed).toBe(0);
  });
});
