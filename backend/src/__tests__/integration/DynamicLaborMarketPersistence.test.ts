import { prisma } from '../../repositories/prisma';
import { worldService } from '../../services/world.service';
import { citizenService } from '../../services/citizen.service';
import { persistenceService } from '../../services/persistence.service';
import { timeService } from '../../services/time.service';
import { civilizationIntelligenceService } from '../../services/civilizationIntelligence.service';
import { CitizenGender, CitizenStatus, EmploymentStatus, JobType, SkillType, WorkplaceType } from '@genesis/shared';
import { TimeUtils } from '@genesis/engine';

describe('Project Genesis — T8.6.5.3: Dynamic Labor Market Persistence & Cold Restart Integrity', () => {
  jest.setTimeout(60000);

  const testSuffix = `dlm-${Date.now()}`;
  let worldId: string;
  let regionId: string;
  let wpId: string;
  let pos1Id: string;
  let pos2Id: string;
  let worker1Id: string;
  let worker2Id: string;
  let immigrantId: string;

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
    await prisma.simulationState.deleteMany({});

    // 2. Setup World in DB
    const world = await prisma.world.create({
      data: {
        name: `DLM World ${testSuffix}`,
        description: 'Dynamic Labor Market Test World',
        randomSeed: 865,
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
        description: 'Region for labor market test',
        population: 2,
        coordX: 0,
        coordY: 0,
        width: 1000,
        height: 1000
      }
    });
    regionId = region.id;

    // Simulation state
    const { simulationRepository } = await import('../../repositories');
    await simulationRepository.upsertSimulationState(TimeUtils.fromSeconds(0), 1, world.id);

    // 3. Create Workplace with capacity 2 in DB
    wpId = `wp-factory-${testSuffix}`;
    pos1Id = `pos-1-${testSuffix}`;
    pos2Id = `pos-2-${testSuffix}`;

    await prisma.workplace.create({
      data: {
        id: wpId,
        type: WorkplaceType.FACTORY,
        locationId: regionId,
        regionId: regionId,
        capacity: 2,
        occupiedPositions: 0,
        vacancies: 2
      }
    });

    await prisma.jobPosition.create({
      data: {
        id: pos1Id,
        workplaceId: wpId,
        type: JobType.FACTORY_WORKER,
        requiredSkillsJson: JSON.stringify({ [SkillType.GENERAL_LABOR]: 10 }),
        occupantId: null,
        scheduleStartHour: 8,
        scheduleEndHour: 16
      }
    });

    await prisma.jobPosition.create({
      data: {
        id: pos2Id,
        workplaceId: wpId,
        type: JobType.FACTORY_WORKER,
        requiredSkillsJson: JSON.stringify({ [SkillType.GENERAL_LABOR]: 10 }),
        occupantId: null,
        scheduleStartHour: 8,
        scheduleEndHour: 16
      }
    });

    // 4. Create 2 adult citizens in DB
    worker1Id = `worker-1-${testSuffix}`;
    worker2Id = `worker-2-${testSuffix}`;
    const simTime = TimeUtils.fromSeconds(0);
    const adultBirthDate = { ...simTime, year: simTime.year - 25 };

    await prisma.citizen.create({
      data: {
        id: worker1Id,
        name: 'Worker One',
        gender: CitizenGender.MALE,
        status: CitizenStatus.ACTIVE,
        locationId: regionId,
        birthDateJson: JSON.stringify(adultBirthDate),
        createdAtSimJson: JSON.stringify(simTime),
        vitalStateJson: JSON.stringify({ hunger: 0, thirst: 0, energy: 100, health: 100, lastUpdatedSimulationTime: simTime }),
        personalityJson: JSON.stringify({ priceSensitivity: 50, qualityPreference: 50, conveniencePreference: 50, planningTendency: 50, socialEngagement: 50, riskTolerance: 50, savingTendency: 50 }),
        skillsJson: JSON.stringify([{ type: SkillType.GENERAL_LABOR, level: 30, experience: 0 }]),
        employmentStatus: EmploymentStatus.UNEMPLOYED,
        movementState: 'IDLE'
      }
    });

    await prisma.citizen.create({
      data: {
        id: worker2Id,
        name: 'Worker Two',
        gender: CitizenGender.FEMALE,
        status: CitizenStatus.ACTIVE,
        locationId: regionId,
        birthDateJson: JSON.stringify(adultBirthDate),
        createdAtSimJson: JSON.stringify(simTime),
        vitalStateJson: JSON.stringify({ hunger: 0, thirst: 0, energy: 100, health: 100, lastUpdatedSimulationTime: simTime }),
        personalityJson: JSON.stringify({ priceSensitivity: 50, qualityPreference: 50, conveniencePreference: 50, planningTendency: 50, socialEngagement: 50, riskTolerance: 50, savingTendency: 50 }),
        skillsJson: JSON.stringify([{ type: SkillType.GENERAL_LABOR, level: 30, experience: 0 }]),
        employmentStatus: EmploymentStatus.UNEMPLOYED,
        movementState: 'IDLE'
      }
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  test('STEP 1: Bootstrap from DB and perform initial job assignment', async () => {
    // Bootstrap services from DB
    await persistenceService.bootstrap();

    const memWp = worldService.engine.workplaceRepository.findById(wpId);
    expect(memWp).toBeDefined();
    expect(memWp?.positions.length).toBe(2);

    const w1 = citizenService.engine.getCitizen(worker1Id);
    const w2 = citizenService.engine.getCitizen(worker2Id);
    expect(w1).toBeDefined();
    expect(w2).toBeDefined();

    // Run dynamic job assignment
    const assigned = citizenService.occupationService.runJobAssignment();
    expect(assigned.length).toBe(2);

    expect(w1?.employmentStatus).toBe(EmploymentStatus.EMPLOYED);
    expect(w1?.workplaceId).toBe(wpId);
    expect(w2?.employmentStatus).toBe(EmploymentStatus.EMPLOYED);
    expect(w2?.workplaceId).toBe(wpId);

    expect(memWp?.occupiedPositions).toBe(2);
    expect(memWp?.vacancies).toBe(0);

    // Persist tick boundary to save assignments to DB
    await persistenceService.persistTickBoundary({
      citizens: [worker1Id, worker2Id]
    });

    // Check DB consistency
    const dbWp = await prisma.workplace.findUnique({ where: { id: wpId } });
    expect(dbWp?.occupiedPositions).toBe(2);
    expect(dbWp?.vacancies).toBe(0);

    const dbPos1 = await prisma.jobPosition.findUnique({ where: { id: pos1Id } });
    const dbPos2 = await prisma.jobPosition.findUnique({ where: { id: pos2Id } });
    expect(dbPos1?.occupantId).not.toBeNull();
    expect(dbPos2?.occupantId).not.toBeNull();

    const dbC1 = await prisma.citizen.findUnique({ where: { id: worker1Id } });
    const dbC2 = await prisma.citizen.findUnique({ where: { id: worker2Id } });
    expect(dbC1?.employmentStatus).toBe(EmploymentStatus.EMPLOYED);
    expect(dbC1?.workplaceId).toBe(wpId);
    expect(dbC2?.employmentStatus).toBe(EmploymentStatus.EMPLOYED);
    expect(dbC2?.workplaceId).toBe(wpId);
  });

  test('STEP 2: Cold restart preserves citizen employment, position occupants, and workplace vacancies', async () => {
    // Perform cold restart: reset in-memory state
    worldService.engine.reset();
    citizenService.reset();

    // Re-bootstrap from DB
    await persistenceService.bootstrap();

    const restartedWp = worldService.engine.workplaceRepository.findById(wpId);
    expect(restartedWp).toBeDefined();
    expect(restartedWp?.occupiedPositions).toBe(2);
    expect(restartedWp?.vacancies).toBe(0);
    expect(restartedWp?.positions.length).toBe(2);

    // Positions in memory must have occupants restored
    const occupants = restartedWp?.positions.map(p => p.occupantId).sort();
    expect(occupants).toEqual([worker1Id, worker2Id].sort());

    const restartedC1 = citizenService.engine.getCitizen(worker1Id);
    const restartedC2 = citizenService.engine.getCitizen(worker2Id);
    expect(restartedC1?.employmentStatus).toBe(EmploymentStatus.EMPLOYED);
    expect(restartedC1?.workplaceId).toBe(wpId);
    expect(restartedC2?.employmentStatus).toBe(EmploymentStatus.EMPLOYED);
    expect(restartedC2?.workplaceId).toBe(wpId);

    // Re-running job assignment after cold restart must NOT duplicate or overwrite
    const reassigned = citizenService.occupationService.runJobAssignment();
    expect(reassigned.length).toBe(0);
    expect(restartedWp?.occupiedPositions).toBe(2);
    expect(restartedWp?.vacancies).toBe(0);
  });

  test('STEP 3: Worker 1 dies, vacating position; vacancy is persisted and survives cold restart', async () => {
    // Worker 1 dies
    citizenService.engine.updateStatus(worker1Id, CitizenStatus.DECEASED);

    const memWp = worldService.engine.workplaceRepository.findById(wpId);
    expect(memWp?.occupiedPositions).toBe(1);
    expect(memWp?.vacancies).toBe(1);

    const c1 = citizenService.engine.getCitizen(worker1Id);
    expect(c1?.status).toBe(CitizenStatus.DECEASED);
    expect(c1?.workplaceId).toBeNull();

    // Persist death & vacancy
    await persistenceService.persistTickBoundary({
      citizens: [worker1Id]
    });

    const dbWp = await prisma.workplace.findUnique({ where: { id: wpId } });
    expect(dbWp?.occupiedPositions).toBe(1);
    expect(dbWp?.vacancies).toBe(1);

    // Cold restart to verify vacancy survives
    worldService.engine.reset();
    citizenService.reset();
    await persistenceService.bootstrap();

    const wpAfterRestart = worldService.engine.workplaceRepository.findById(wpId);
    expect(wpAfterRestart?.occupiedPositions).toBe(1);
    expect(wpAfterRestart?.vacancies).toBe(1);

    const vacantPos = wpAfterRestart?.positions.find(p => p.occupantId === null);
    expect(vacantPos).toBeDefined();

    const occupiedPos = wpAfterRestart?.positions.find(p => p.occupantId === worker2Id);
    expect(occupiedPos).toBeDefined();
  });

  test('STEP 4: New immigrant arrives, gets assigned to the vacant position, and survives cold restart', async () => {
    // Immigrant arrives
    const time = timeService.engine.getCurrentTime();
    const adultBirth = { ...time, year: time.year - 26 };
    const immigrant = citizenService.engine.createCitizenForImmigrant(CitizenGender.FEMALE, adultBirth, regionId);
    immigrantId = immigrant.id;
    immigrant.skills = [{ type: SkillType.GENERAL_LABOR, level: 35, experience: 0 }];

    expect(immigrant.employmentStatus).toBe(EmploymentStatus.UNEMPLOYED);

    // Run demographic simulation tick (which invokes dynamic job assignment)
    citizenService.simulator.processDemographics(time);

    // Immigrant should now be hired into the vacant position
    expect(immigrant.employmentStatus).toBe(EmploymentStatus.EMPLOYED);
    expect(immigrant.workplaceId).toBe(wpId);

    const memWp = worldService.engine.workplaceRepository.findById(wpId);
    expect(memWp?.occupiedPositions).toBe(2);
    expect(memWp?.vacancies).toBe(0);

    // Persist tick boundary
    await persistenceService.persistTickBoundary({
      citizens: [immigrantId]
    });

    // Check DB
    const dbWp = await prisma.workplace.findUnique({ where: { id: wpId } });
    expect(dbWp?.occupiedPositions).toBe(2);
    expect(dbWp?.vacancies).toBe(0);

    const dbImmigrant = await prisma.citizen.findUnique({ where: { id: immigrantId } });
    expect(dbImmigrant?.employmentStatus).toBe(EmploymentStatus.EMPLOYED);
    expect(dbImmigrant?.workplaceId).toBe(wpId);

    // Cold restart to verify Worker 2 and Immigrant both remain employed
    worldService.engine.reset();
    citizenService.reset();
    await persistenceService.bootstrap();

    const finalWp = worldService.engine.workplaceRepository.findById(wpId);
    expect(finalWp?.occupiedPositions).toBe(2);
    expect(finalWp?.vacancies).toBe(0);

    const finalOccupants = finalWp?.positions.map(p => p.occupantId).sort();
    expect(finalOccupants).toEqual([worker2Id, immigrantId].sort());

    const finalImm = citizenService.engine.getCitizen(immigrantId);
    expect(finalImm?.employmentStatus).toBe(EmploymentStatus.EMPLOYED);
    expect(finalImm?.workplaceId).toBe(wpId);

    // Check CivilizationIntelligence
    const summary = await civilizationIntelligenceService.getCivilizationSummary();
    expect(summary.employment.employed).toBe(2);
    expect(summary.employment.vacancies).toBe(0);
    expect(summary.employment.filledPositions).toBe(2);
  });
});
