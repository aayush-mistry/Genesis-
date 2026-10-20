import { 
  CitizenGender, 
  CitizenStatus, 
  EmploymentStatus, 
  JobType, 
  SkillType, 
  WorkplaceType,
  Workplace,
  Commodity,
  ProductionDefinition,
  ProductCategory
} from '@genesis/shared';
import { TimeEngine } from '../../time/TimeEngine';
import { WorldEngine } from '../../world/WorldEngine';
import { EventScheduler } from '../../events/EventScheduler';
import { SpatialEngine } from '../../spatial/SpatialEngine';
import { InMemoryCitizenRepository } from '../repositories/InMemoryCitizenRepository';
import { CitizenService } from '../services/CitizenService';
import { OccupationService } from '../services/OccupationService';
import { PopulationSimulator } from '../services/PopulationSimulator';
import { HouseholdService } from '../services/HouseholdService';
import { InventoryManager } from '../../inventory/InventoryManager';
import { ProductionEngine } from '../../production/ProductionEngine';
import { ResourceEngine } from '../../resources/ResourceEngine';

describe('Project Genesis — T8.6.5.3: Dynamic Labor Market & Workforce Sustainability (Engine Suite)', () => {
  let timeEngine: TimeEngine;
  let worldEngine: WorldEngine;
  let eventScheduler: EventScheduler;
  let spatialEngine: SpatialEngine;
  let citizenRepo: InMemoryCitizenRepository;
  let citizenService: CitizenService;
  let householdService: HouseholdService;
  let occupationService: OccupationService;
  let simulator: PopulationSimulator;
  let inventoryManager: InventoryManager;
  let productionEngine: ProductionEngine;
  let regionId: string;

  beforeEach(() => {
    timeEngine = new TimeEngine();
    worldEngine = new WorldEngine();
    eventScheduler = new EventScheduler(timeEngine);
    spatialEngine = new SpatialEngine(worldEngine, eventScheduler);
    citizenRepo = new InMemoryCitizenRepository();
    inventoryManager = new InventoryManager();
    householdService = new HouseholdService(inventoryManager);

    citizenService = new CitizenService(
      citizenRepo,
      worldEngine,
      timeEngine,
      eventScheduler,
      spatialEngine.queryService,
      householdService
    );

    occupationService = new OccupationService(citizenService, worldEngine.workplaceRepository);

    worldEngine.worldManager.createWorld('world-1', 'Test World');
    const region = worldEngine.regionManager.createRegion({
      name: 'Region 1',
      climate: 'Temperate',
      description: 'Test Region',
      population: 0,
      coordinates: { x: 0, y: 0 },
      worldId: 'world-1',
      createdAt: new Date(),
      updatedAt: new Date()
    });
    regionId = region.id;

    simulator = new PopulationSimulator(
      citizenService,
      timeEngine,
      occupationService,
      worldEngine.workplaceGenerator,
      () => regionId
    );

    const resourceEngine = new ResourceEngine(worldEngine, {} as any, eventScheduler, timeEngine);
    productionEngine = new ProductionEngine(
      worldEngine,
      eventScheduler,
      timeEngine,
      inventoryManager,
      resourceEngine
    );
  });

  test('1. An employed worker dies and the workplace vacancy becomes available', () => {
    const time = timeEngine.getCurrentTime();
    const worker = citizenService.createCitizen(CitizenGender.MALE, null, { ...time, year: time.year - 25 });
    worker.skills = [{ type: SkillType.GENERAL_LABOR, level: 50, experience: 0 }];

    const workplace: Workplace = {
      id: 'wp-factory-1',
      type: WorkplaceType.FACTORY,
      locationId: 'loc-1',
      regionId,
      capacity: 1,
      occupiedPositions: 0,
      vacancies: 1,
      positions: [{
        id: 'pos-1',
        workplaceId: 'wp-factory-1',
        type: JobType.FACTORY_WORKER,
        requiredSkills: { [SkillType.GENERAL_LABOR]: 10 },
        occupantId: null,
        schedule: { startTime: 8, endTime: 16 }
      }]
    };
    worldEngine.workplaceRepository.create(workplace);

    // Initial assignment
    occupationService.runJobAssignment();
    expect(worker.employmentStatus).toBe(EmploymentStatus.EMPLOYED);
    expect(worker.workplaceId).toBe('wp-factory-1');
    expect(workplace.occupiedPositions).toBe(1);
    expect(workplace.vacancies).toBe(0);
    expect(workplace.positions[0].occupantId).toBe(worker.id);

    // Worker dies
    citizenService.updateStatus(worker.id, CitizenStatus.DECEASED);

    expect(worker.status).toBe(CitizenStatus.DECEASED);
    expect(worker.workplaceId).toBeNull();
    expect(workplace.occupiedPositions).toBe(0);
    expect(workplace.vacancies).toBe(1);
    expect(workplace.positions[0].occupantId).toBeNull();
  });

  test('2. An eligible unemployed adult or immigrant is assigned to a real vacancy', () => {
    const time = timeEngine.getCurrentTime();
    
    // Existing factory with 1 vacancy
    const workplace: Workplace = {
      id: 'wp-factory-2',
      type: WorkplaceType.FACTORY,
      locationId: 'loc-1',
      regionId,
      capacity: 1,
      occupiedPositions: 0,
      vacancies: 1,
      positions: [{
        id: 'pos-2',
        workplaceId: 'wp-factory-2',
        type: JobType.FACTORY_WORKER,
        requiredSkills: { [SkillType.GENERAL_LABOR]: 10 },
        occupantId: null,
        schedule: { startTime: 8, endTime: 16 }
      }]
    };
    worldEngine.workplaceRepository.create(workplace);

    // New immigrant arrives
    const immigrant = citizenService.createCitizenForImmigrant(
      CitizenGender.FEMALE,
      { ...time, year: time.year - 24 },
      regionId
    );
    immigrant.skills = [{ type: SkillType.GENERAL_LABOR, level: 40, experience: 0 }];

    expect(immigrant.employmentStatus).toBe(EmploymentStatus.UNEMPLOYED);

    // Dynamic job assignment runs
    const assigned = occupationService.runJobAssignment();
    
    expect(assigned).toContain(immigrant);
    expect(immigrant.employmentStatus).toBe(EmploymentStatus.EMPLOYED);
    expect(immigrant.workplaceId).toBe('wp-factory-2');
    expect(immigrant.jobType).toBe(JobType.FACTORY_WORKER);
    expect(workplace.occupiedPositions).toBe(1);
    expect(workplace.vacancies).toBe(0);
    expect(workplace.positions[0].occupantId).toBe(immigrant.id);
  });

  test('3. Ineligible citizens (deceased, children, retired, lacking skills) are not assigned', () => {
    const time = timeEngine.getCurrentTime();

    // 1. Child (< 18)
    const child = citizenService.createCitizen(CitizenGender.MALE, null, { ...time, year: time.year - 14 });
    child.skills = [{ type: SkillType.GENERAL_LABOR, level: 100, experience: 0 }];

    // 2. Retired (>= 75)
    const senior = citizenService.createCitizen(CitizenGender.FEMALE, null, { ...time, year: time.year - 80 });
    senior.skills = [{ type: SkillType.GENERAL_LABOR, level: 100, experience: 0 }];

    // 3. Deceased citizen
    const deceased = citizenService.createCitizen(CitizenGender.MALE, null, { ...time, year: time.year - 30 });
    deceased.skills = [{ type: SkillType.GENERAL_LABOR, level: 100, experience: 0 }];
    citizenService.updateStatus(deceased.id, CitizenStatus.DECEASED);

    // 4. Adult lacking required skill
    const unqualified = citizenService.createCitizen(CitizenGender.FEMALE, null, { ...time, year: time.year - 25 });
    unqualified.skills = [{ type: SkillType.GENERAL_LABOR, level: 5, experience: 0 }]; // Required is 50

    const workplace: Workplace = {
      id: 'wp-high-skill',
      type: WorkplaceType.FACTORY,
      locationId: 'loc-1',
      regionId,
      capacity: 4,
      occupiedPositions: 0,
      vacancies: 4,
      positions: [
        { id: 'p1', workplaceId: 'wp-high-skill', type: JobType.FACTORY_WORKER, requiredSkills: { [SkillType.GENERAL_LABOR]: 50 }, occupantId: null, schedule: { startTime: 8, endTime: 16 } },
        { id: 'p2', workplaceId: 'wp-high-skill', type: JobType.FACTORY_WORKER, requiredSkills: { [SkillType.GENERAL_LABOR]: 50 }, occupantId: null, schedule: { startTime: 8, endTime: 16 } },
        { id: 'p3', workplaceId: 'wp-high-skill', type: JobType.FACTORY_WORKER, requiredSkills: { [SkillType.GENERAL_LABOR]: 50 }, occupantId: null, schedule: { startTime: 8, endTime: 16 } },
        { id: 'p4', workplaceId: 'wp-high-skill', type: JobType.FACTORY_WORKER, requiredSkills: { [SkillType.GENERAL_LABOR]: 50 }, occupantId: null, schedule: { startTime: 8, endTime: 16 } },
      ]
    };
    worldEngine.workplaceRepository.create(workplace);

    occupationService.runJobAssignment();

    // Verify none were assigned
    expect(child.workplaceId).toBeNull();
    expect(child.employmentStatus).toBe(EmploymentStatus.STUDENT);

    expect(senior.workplaceId).toBeNull();
    expect(senior.employmentStatus).toBe(EmploymentStatus.RETIRED);

    expect(deceased.workplaceId).toBeNull();

    expect(unqualified.workplaceId).toBeNull();
    expect(unqualified.employmentStatus).toBe(EmploymentStatus.UNEMPLOYED);

    expect(workplace.occupiedPositions).toBe(0);
    expect(workplace.vacancies).toBe(4);

    // Direct assignment validation checks
    expect(() => occupationService.assignJob(deceased, workplace, workplace.positions[0])).toThrow('Cannot assign job to non-active or deceased citizen');
    expect(() => occupationService.assignJob(child, workplace, workplace.positions[0])).toThrow('Citizen is not of working age');
    expect(() => occupationService.assignJob(senior, workplace, workplace.positions[0])).toThrow('Citizen is not of working age');
  });

  test('4. Workplace capacity is never exceeded', () => {
    const time = timeEngine.getCurrentTime();

    // Workplace with capacity 2
    const workplace: Workplace = {
      id: 'wp-cap-2',
      type: WorkplaceType.FACTORY,
      locationId: 'loc-1',
      regionId,
      capacity: 2,
      occupiedPositions: 0,
      vacancies: 2,
      positions: [
        { id: 'pos-a', workplaceId: 'wp-cap-2', type: JobType.FACTORY_WORKER, requiredSkills: {}, occupantId: null, schedule: { startTime: 8, endTime: 16 } },
        { id: 'pos-b', workplaceId: 'wp-cap-2', type: JobType.FACTORY_WORKER, requiredSkills: {}, occupantId: null, schedule: { startTime: 8, endTime: 16 } }
      ]
    };
    worldEngine.workplaceRepository.create(workplace);

    // 5 eligible adult candidates
    const candidates = [];
    for (let i = 0; i < 5; i++) {
      const c = citizenService.createCitizen(CitizenGender.MALE, null, { ...time, year: time.year - 22 - i }, 100 + i);
      candidates.push(c);
    }

    occupationService.runJobAssignment();

    expect(workplace.occupiedPositions).toBe(2);
    expect(workplace.vacancies).toBe(0);

    const employed = candidates.filter(c => c.employmentStatus === EmploymentStatus.EMPLOYED);
    const unemployed = candidates.filter(c => c.employmentStatus === EmploymentStatus.UNEMPLOYED);

    expect(employed.length).toBe(2);
    expect(unemployed.length).toBe(3);

    // Attempting direct assignment when full throws
    expect(() => occupationService.assignJob(unemployed[0], workplace, workplace.positions[0])).toThrow();
  });

  test('5. Repeated assignment runs do not duplicate jobs or occupancy', () => {
    const time = timeEngine.getCurrentTime();

    const workplace: Workplace = {
      id: 'wp-repeat-1',
      type: WorkplaceType.FACTORY,
      locationId: 'loc-1',
      regionId,
      capacity: 1,
      occupiedPositions: 0,
      vacancies: 1,
      positions: [
        { id: 'pos-rep', workplaceId: 'wp-repeat-1', type: JobType.FACTORY_WORKER, requiredSkills: {}, occupantId: null, schedule: { startTime: 8, endTime: 16 } }
      ]
    };
    worldEngine.workplaceRepository.create(workplace);

    const c1 = citizenService.createCitizen(CitizenGender.MALE, null, { ...time, year: time.year - 25 }, 1);
    const c2 = citizenService.createCitizen(CitizenGender.FEMALE, null, { ...time, year: time.year - 26 }, 2);

    // First run
    occupationService.runJobAssignment();
    expect(workplace.occupiedPositions).toBe(1);
    expect(workplace.vacancies).toBe(0);

    const firstEmployed = c1.employmentStatus === EmploymentStatus.EMPLOYED ? c1 : c2;

    // Second run immediately
    const secondRunAssigned = occupationService.runJobAssignment();
    expect(secondRunAssigned.length).toBe(0); // Nothing new assigned
    expect(workplace.occupiedPositions).toBe(1);
    expect(workplace.vacancies).toBe(0);
    expect(firstEmployed.workplaceId).toBe('wp-repeat-1');

    // Third run after demographic simulation tick
    time.month += 1;
    simulator.processDemographics(time);
    expect(workplace.occupiedPositions).toBe(1);
    expect(workplace.vacancies).toBe(0);
    expect(firstEmployed.workplaceId).toBe('wp-repeat-1');
  });

  test('6. Production resumes or recovers when staffing is restored', () => {
    const time = timeEngine.getCurrentTime();

    // Register commodity & production definition
    const wheatCommodity: Commodity = {
      id: 'wheat',
      name: 'Wheat',
      category: ProductCategory.FOOD,
      unit: 'kg',
      basePrice: 10,
      isBiological: true
    };
    productionEngine.registerCommodity(wheatCommodity);

    const definition: ProductionDefinition = {
      productId: 'wheat',
      workplaceType: WorkplaceType.FARM,
      unit: 'kg',
      workersRequiredPerUnitArea: 1,
      baseYieldPerArea: 100
    };
    productionEngine.registerProductionDefinition(definition);

    // Setup inventory for workplace
    const inv = inventoryManager.createInventory('inv-farm-1', 'wp-farm-1', 1000);

    const workplace: Workplace = {
      id: 'wp-farm-1',
      type: WorkplaceType.FARM,
      locationId: 'loc-1',
      regionId,
      capacity: 2,
      occupiedPositions: 0,
      vacancies: 2,
      inventoryId: inv.id,
      positions: [
        { id: 'f-pos-1', workplaceId: 'wp-farm-1', type: JobType.FARMER, requiredSkills: {}, occupantId: null, schedule: { startTime: 8, endTime: 16 } },
        { id: 'f-pos-2', workplaceId: 'wp-farm-1', type: JobType.FARMER, requiredSkills: {}, occupantId: null, schedule: { startTime: 8, endTime: 16 } },
      ]
    };
    worldEngine.workplaceRepository.create(workplace);

    // Two workers
    const w1 = citizenService.createCitizen(CitizenGender.MALE, null, { ...time, year: time.year - 30 });
    const w2 = citizenService.createCitizen(CitizenGender.FEMALE, null, { ...time, year: time.year - 32 });

    occupationService.runJobAssignment();
    expect(workplace.occupiedPositions).toBe(2);

    // 1. Full staffing production cycle: 2/2 workers -> 100% capacity
    // Base capacity = (capacity / workersRequired) * baseYield = (2 / 1) * 100 = 200
    productionEngine.runProductionCycle('cycle-1');
    let item = inventoryManager.getInventory(inv.id)?.items['wheat'];
    expect(item?.totalQuantity).toBe(200);

    // 2. Worker 1 dies -> staffing drops to 1/2
    citizenService.updateStatus(w1.id, CitizenStatus.DECEASED);
    expect(workplace.occupiedPositions).toBe(1);
    expect(workplace.vacancies).toBe(1);

    productionEngine.runProductionCycle('cycle-2');
    item = inventoryManager.getInventory(inv.id)?.items['wheat'];
    // Previous 200 + (200 * 0.5) = 300
    expect(item?.totalQuantity).toBe(300);

    // 3. New immigrant hired -> staffing restored to 2/2
    const w3 = citizenService.createCitizenForImmigrant(CitizenGender.MALE, { ...time, year: time.year - 28 });
    occupationService.runJobAssignment();
    expect(w3.employmentStatus).toBe(EmploymentStatus.EMPLOYED);
    expect(workplace.occupiedPositions).toBe(2);

    productionEngine.runProductionCycle('cycle-3');
    item = inventoryManager.getInventory(inv.id)?.items['wheat'];
    // Previous 300 + 200 = 500
    expect(item?.totalQuantity).toBe(500);
  });

  test('7. Demographic lifecycle assigns jobs to newly turned adults and new immigrants', () => {
    const time = timeEngine.getCurrentTime();

    const workplace: Workplace = {
      id: 'wp-shop-1',
      type: WorkplaceType.SHOP,
      locationId: 'loc-1',
      regionId,
      capacity: 2,
      occupiedPositions: 0,
      vacancies: 2,
      positions: [
        { id: 's-pos-1', workplaceId: 'wp-shop-1', type: JobType.SHOPKEEPER, requiredSkills: {}, occupantId: null, schedule: { startTime: 9, endTime: 17 } },
        { id: 's-pos-2', workplaceId: 'wp-shop-1', type: JobType.SHOPKEEPER, requiredSkills: {}, occupantId: null, schedule: { startTime: 9, endTime: 17 } },
      ]
    };
    worldEngine.workplaceRepository.create(workplace);

    // Citizen who is 17 years and 11 months old
    const almostAdultBirth = { ...time, year: time.year - 18, month: time.month + 1 };
    const almostAdult = citizenService.createCitizen(CitizenGender.MALE, null, almostAdultBirth);
    occupationService.evaluateCitizenEligibility(almostAdult);
    expect(almostAdult.employmentStatus).toBe(EmploymentStatus.STUDENT);

    // Advance time by 1 month so they turn 18
    const nextMonth = { ...time, month: time.month + 1 };
    timeEngine.setCurrentTime(nextMonth);

    // Running demographic processing triggers job assignment
    let jobAssignedEvents: any[] = [];
    simulator.onDemographicEvent = (evt) => {
      if (evt.type === 'JOB_ASSIGNED') {
        jobAssignedEvents.push(evt);
      }
    };

    simulator.processDemographics(nextMonth);

    expect(almostAdult.employmentStatus).toBe(EmploymentStatus.EMPLOYED);
    expect(almostAdult.workplaceId).toBe('wp-shop-1');
    expect(workplace.occupiedPositions).toBeGreaterThanOrEqual(1);
    expect(jobAssignedEvents.some(e => e.citizen.id === almostAdult.id)).toBe(true);
  });

  test('8. Existing initial population initialization correctly assigns jobs and generates workplaces', () => {
    // Fresh simulator with workplace generator provided
    const freshWorld = new WorldEngine();
    freshWorld.worldManager.createWorld('w-fresh', 'Fresh');
    const freshRegion = freshWorld.regionManager.createRegion({
      name: 'R1', climate: 'Temperate', description: 'R1', population: 0, coordinates: { x: 0, y: 0 }, worldId: 'w-fresh', createdAt: new Date(), updatedAt: new Date()
    });
    const freshCity = freshWorld.cityManager.createCity({
      name: 'C1', regionId: freshRegion.id, population: 0, area: 100, coordinates: { x: 0, y: 0 }, width: 100, height: 100, createdAt: new Date(), updatedAt: new Date()
    });
    freshWorld.regionManager.addCity(freshRegion.id, freshCity.id);

    const freshCitizenRepo = new InMemoryCitizenRepository();
    const freshCitizenService = new CitizenService(
      freshCitizenRepo, freshWorld, timeEngine, eventScheduler, spatialEngine.queryService, householdService
    );
    const freshOccupationService = new OccupationService(freshCitizenService, freshWorld.workplaceRepository);

    const freshSimulator = new PopulationSimulator(
      freshCitizenService,
      timeEngine,
      freshOccupationService,
      freshWorld.workplaceGenerator,
      () => freshCity.id
    );

    // Initialize with 100 citizens
    freshSimulator.initializePopulation(100);

    const citizens = freshCitizenService.listCitizens();
    expect(citizens.length).toBe(100);

    const workplaces = freshWorld.workplaceRepository.findAll();
    expect(workplaces.length).toBeGreaterThan(0);

    const employedCitizens = citizens.filter(c => c.employmentStatus === EmploymentStatus.EMPLOYED);
    expect(employedCitizens.length).toBeGreaterThan(0);

    // Verify all employed citizens have valid workplaceIds and valid positions
    for (const emp of employedCitizens) {
      expect(emp.workplaceId).not.toBeNull();
      const wp = freshWorld.workplaceRepository.findById(emp.workplaceId!);
      expect(wp).toBeDefined();
      const pos = wp!.positions.find(p => p.occupantId === emp.id);
      expect(pos).toBeDefined();
    }
  });
});
