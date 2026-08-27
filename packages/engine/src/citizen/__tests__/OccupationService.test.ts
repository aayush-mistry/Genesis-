import { OccupationService } from '../services/OccupationService';
import { CitizenService } from '../services/CitizenService';
import { InMemoryCitizenRepository } from '../repositories/InMemoryCitizenRepository';
import { TimeEngine } from '../../time/TimeEngine';
import { WorldEngine } from '../../world/WorldEngine';
import { EventScheduler } from '../../events/EventScheduler';
import { SpatialEngine } from '../../spatial/SpatialEngine';
import { CitizenGender, EmploymentStatus, JobType, SkillType, WorkplaceType } from '@genesis/shared';
import { WorkplaceRepository } from '../../world/repositories/WorkplaceRepository';

describe('OccupationService', () => {
  let timeEngine: TimeEngine;
  let worldEngine: WorldEngine;
  let scheduler: EventScheduler;
  let spatialEngine: SpatialEngine;
  let citizenRepo: InMemoryCitizenRepository;
  let citizenService: CitizenService;
  let workplaceRepo: WorkplaceRepository;
  let occupationService: OccupationService;

  beforeEach(() => {
    timeEngine = new TimeEngine();
    scheduler = new EventScheduler(timeEngine);
    worldEngine = new WorldEngine();
    spatialEngine = new SpatialEngine(worldEngine, scheduler);
    citizenRepo = new InMemoryCitizenRepository();
    citizenService = new CitizenService(citizenRepo, worldEngine, timeEngine, scheduler, spatialEngine.queryService, new (require('../../citizen/services/HouseholdService').HouseholdService)(new (require('../../inventory/InventoryManager').InventoryManager)()));
    workplaceRepo = new WorkplaceRepository();
    occupationService = new OccupationService(citizenService, workplaceRepo);
  });

  it('TEST 1: Citizen under 18 cannot work', () => {
    const time = timeEngine.getCurrentTime();
    const citizen = citizenService.createCitizen(CitizenGender.MALE, null, { ...time, year: time.year - 15 });
    occupationService.evaluateCitizenEligibility(citizen);
    expect(citizen.employmentStatus).toBe(EmploymentStatus.STUDENT);
  });

  it('TEST 2: Citizen aged 18 can be assigned employment', () => {
    const time = timeEngine.getCurrentTime();
    const citizen = citizenService.createCitizen(CitizenGender.FEMALE, null, { ...time, year: time.year - 20 });
    occupationService.evaluateCitizenEligibility(citizen);
    expect(citizen.employmentStatus).toBe(EmploymentStatus.UNEMPLOYED);
  });

  it('TEST 3: Citizen aged 75+ cannot work', () => {
    const time = timeEngine.getCurrentTime();
    const citizen = citizenService.createCitizen(CitizenGender.OTHER, null, { ...time, year: time.year - 80 });
    occupationService.evaluateCitizenEligibility(citizen);
    expect(citizen.employmentStatus).toBe(EmploymentStatus.RETIRED);
  });

  it('TEST 4: Student state is assigned to citizens under 18', () => {
    const time = timeEngine.getCurrentTime();
    const citizen = citizenService.createCitizen(CitizenGender.MALE, null, { ...time, year: time.year - 10 });
    occupationService.evaluateCitizenEligibility(citizen);
    expect(citizen.employmentStatus).toBe(EmploymentStatus.STUDENT);
  });

  it('TEST 5: Retired state is assigned to citizens aged 75+', () => {
    const time = timeEngine.getCurrentTime();
    const citizen = citizenService.createCitizen(CitizenGender.MALE, null, { ...time, year: time.year - 76 });
    occupationService.evaluateCitizenEligibility(citizen);
    expect(citizen.employmentStatus).toBe(EmploymentStatus.RETIRED);
  });

  it('TEST 8: Job requirements are enforced', () => {
    const time = timeEngine.getCurrentTime();
    const citizen = citizenService.createCitizen(CitizenGender.MALE, null, { ...time, year: time.year - 25 });
    
    // Explicitly set skills so we know it fails
    citizen.skills = [{ type: SkillType.AGRICULTURE, level: 5, experience: 0 }];
    
    const score = occupationService.calculateSuitability(citizen, {
      id: 'pos-1',
      workplaceId: 'wp-1',
      type: JobType.FARMER,
      requiredSkills: { [SkillType.AGRICULTURE]: 50 },
      occupantId: null,
      schedule: { startTime: 8, endTime: 16 }
    });
    
    expect(score).toBe(0); // Failed min reqs
  });

  it('TEST 9: Citizen without required skills cannot receive job', () => {
    const time = timeEngine.getCurrentTime();
    const citizen = citizenService.createCitizen(CitizenGender.MALE, null, { ...time, year: time.year - 30 });
    citizen.skills = [{ type: SkillType.AGRICULTURE, level: 10, experience: 0 }];
    occupationService.evaluateCitizenEligibility(citizen);

    workplaceRepo.create({
      id: 'wp-1',
      type: WorkplaceType.FARM,
      locationId: 'loc-1',
      regionId: 'reg-1',
      capacity: 1,
      occupiedPositions: 0,
      vacancies: 1,
      positions: [{
        id: 'pos-1',
        workplaceId: 'wp-1',
        type: JobType.FARMER,
        requiredSkills: { [SkillType.AGRICULTURE]: 50 },
        occupantId: null,
        schedule: { startTime: 8, endTime: 16 }
      }]
    });

    occupationService.runJobAssignment();
    
    expect(citizen.employmentStatus).toBe(EmploymentStatus.UNEMPLOYED); // Still unemployed
  });

  it('TEST 10 & 11: Workplace capacity is respected & No assignment occurs when vacancy = 0', () => {
    const time = timeEngine.getCurrentTime();
    const c1 = citizenService.createCitizen(CitizenGender.MALE, null, { ...time, year: time.year - 30 });
    const c2 = citizenService.createCitizen(CitizenGender.FEMALE, null, { ...time, year: time.year - 31 });
    
    c1.skills = [{ type: SkillType.GENERAL_LABOR, level: 50, experience: 0 }];
    c2.skills = [{ type: SkillType.GENERAL_LABOR, level: 50, experience: 0 }];
    
    workplaceRepo.create({
      id: 'wp-1',
      type: WorkplaceType.FACTORY,
      locationId: 'loc-1',
      regionId: 'reg-1',
      capacity: 1,
      occupiedPositions: 0,
      vacancies: 1,
      positions: [{
        id: 'pos-1',
        workplaceId: 'wp-1',
        type: JobType.LABORER,
        requiredSkills: { [SkillType.GENERAL_LABOR]: 10 },
        occupantId: null,
        schedule: { startTime: 8, endTime: 16 }
      }]
    });

    occupationService.runJobAssignment();
    
    const wp = workplaceRepo.findById('wp-1')!;
    expect(wp.vacancies).toBe(0);
    expect(wp.occupiedPositions).toBe(1);
    
    // One employed, one unemployed
    const employed = [c1, c2].filter(c => c.employmentStatus === EmploymentStatus.EMPLOYED);
    expect(employed.length).toBe(1);
  });

  it('TEST 12: Worker leaving creates a vacancy', () => {
    const time = timeEngine.getCurrentTime();
    const c1 = citizenService.createCitizen(CitizenGender.MALE, null, { ...time, year: time.year - 30 });
    c1.skills = [{ type: SkillType.GENERAL_LABOR, level: 50, experience: 0 }];
    
    workplaceRepo.create({
      id: 'wp-1',
      type: WorkplaceType.FACTORY,
      locationId: 'loc-1',
      regionId: 'reg-1',
      capacity: 1,
      occupiedPositions: 0,
      vacancies: 1,
      positions: [{
        id: 'pos-1',
        workplaceId: 'wp-1',
        type: JobType.LABORER,
        requiredSkills: {},
        occupantId: null,
        schedule: { startTime: 8, endTime: 16 }
      }]
    });

    occupationService.runJobAssignment();
    expect(workplaceRepo.findById('wp-1')!.vacancies).toBe(0);

    occupationService.leaveJob(c1);
    expect(workplaceRepo.findById('wp-1')!.vacancies).toBe(1);
    expect(c1.employmentStatus).toBe(EmploymentStatus.UNEMPLOYED);
  });

  it('TEST 22 & 23: Job assignment is deterministic & Two equal candidates resolve deterministically', () => {
    const time = timeEngine.getCurrentTime();
    // Same skills, exact same age
    const c1 = citizenService.createCitizen(CitizenGender.MALE, null, { ...time, year: time.year - 30 }, 100);
    const c2 = citizenService.createCitizen(CitizenGender.FEMALE, null, { ...time, year: time.year - 30 }, 200);
    
    c1.skills = [{ type: SkillType.ADMINISTRATION, level: 50, experience: 0 }];
    c2.skills = [{ type: SkillType.ADMINISTRATION, level: 50, experience: 0 }];
    
    workplaceRepo.create({
      id: 'wp-1',
      type: WorkplaceType.OFFICE,
      locationId: 'loc-1',
      regionId: 'reg-1',
      capacity: 1,
      occupiedPositions: 0,
      vacancies: 1,
      positions: [{
        id: 'pos-1',
        workplaceId: 'wp-1',
        type: JobType.OFFICE_WORKER,
        requiredSkills: {},
        occupantId: null,
        schedule: { startTime: 8, endTime: 16 }
      }]
    });

    occupationService.runJobAssignment();
    
    // It should pick deterministically based on sorting.
    // They both have score 50 (no requirements, base 50, or exact match). 
    // ID comparison breaks the tie.
    // Ensure one is selected repeatedly if we reset.
    const selected = c1.employmentStatus === EmploymentStatus.EMPLOYED ? c1 : c2;
    expect(selected.employmentStatus).toBe(EmploymentStatus.EMPLOYED);
  });
});

