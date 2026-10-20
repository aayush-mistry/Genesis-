import { Citizen, CitizenGender, CitizenStatus, SimulationTime, MovementState, EmploymentStatus } from '@genesis/shared';
import { CitizenRepository } from '../repositories/CitizenRepository';
import { NameGenerator } from '../generators/NameGenerator';
import { AgeCalculator } from './AgeCalculator';
import { SkillGenerator } from '../generators/SkillGenerator';
import { WorldEngine } from '../../world/WorldEngine';
import { TimeEngine } from '../../time/TimeEngine';
import { NeedsService } from './NeedsService';
import { MovementService } from './MovementService';
import { HouseholdService } from './HouseholdService';
import { EventScheduler } from '../../events/EventScheduler';
import { SpatialQueryService } from '../../spatial/SpatialQueryService';
import { ActionState } from '@genesis/shared';
import { ActionExecutor } from '../../execution';
import { DecisionEngine, CandidateGenerator, NeedAnalyzer } from '../../decision';
import { DecisionTriggerType, DecisionContext } from '@genesis/shared';
import { PerceptionService } from '../../perception/PerceptionService';
import { MarketEngine } from '../../market/MarketEngine';
import { SalaryService } from './SalaryService';
import { HouseholdPlacementService } from './HouseholdPlacementService';
import { BuildingType } from '@genesis/shared';

let citizenIdCounter = 1;

export class CitizenService {
  private repository: CitizenRepository;
  private worldEngine: WorldEngine;
  private timeEngine: TimeEngine;
  public needsService: NeedsService;
  public movementService: MovementService;
  public actionExecutor: ActionExecutor;
  private decisionEngine: DecisionEngine;
  private candidateGenerator: CandidateGenerator;
  private eventScheduler: EventScheduler;
  private needAnalyzer: NeedAnalyzer;
  private routineEngine: import('./RoutineEngine').RoutineEngine;
  private perceptionService?: PerceptionService;
  public salaryService?: SalaryService;
  public householdService: HouseholdService;
  public placementService: HouseholdPlacementService;

  constructor(
    repository: CitizenRepository, 
    worldEngine: WorldEngine, 
    timeEngine: TimeEngine,
    eventScheduler: EventScheduler,
    spatialQueryService: SpatialQueryService,
    householdService: HouseholdService,
    placementService?: HouseholdPlacementService
  ) {
    this.repository = repository;
    this.worldEngine = worldEngine;
    this.timeEngine = timeEngine;
    this.eventScheduler = eventScheduler;
    this.needsService = new NeedsService(this.repository);
    this.householdService = householdService;
    this.placementService = placementService || new HouseholdPlacementService(worldEngine, householdService);
    this.movementService = new MovementService(
      this.repository,
      spatialQueryService,
      eventScheduler,
      timeEngine
    );
    this.decisionEngine = new DecisionEngine();
    this.candidateGenerator = new CandidateGenerator();
    this.needAnalyzer = new NeedAnalyzer();
    this.routineEngine = new (require('./RoutineEngine').RoutineEngine)();
    this.actionExecutor = new ActionExecutor(timeEngine, eventScheduler, this.movementService, this.needsService);
  }

  public setPerceptionService(perceptionService: PerceptionService): void {
    this.perceptionService = perceptionService;
  }

  public initializeSalaryService(
    marketEngine: MarketEngine,
    storeRanker: import('../../decision/scoring/StoreRanker').StoreRanker,
    spatialQueryService: SpatialQueryService
  ): void {
    this.salaryService = new SalaryService(
      this,
      this.worldEngine,
      marketEngine,
      this.eventScheduler,
      this.timeEngine
    );
    this.salaryService.initialize();
    this.actionExecutor.setMarketEngine(marketEngine, storeRanker, spatialQueryService);
  }

  /**
   * Helper to instantiate a base Citizen entity without placement or repository commit.
   */
  private createBaseCitizen(
    gender: CitizenGender,
    birthDate?: SimulationTime,
    seed?: number
  ): Citizen {
    const currentTime = this.timeEngine.getCurrentTime();
    const actualBirthDate = birthDate || currentTime;
    
    // Identity Generation
    const id = `citizen-${citizenIdCounter.toString().padStart(6, '0')}`;
    citizenIdCounter++;

    // Generate Name Deterministically if seed provided, otherwise fallback to id-based seed
    const actualSeed = seed !== undefined ? seed : parseInt(id.replace('citizen-', ''), 10);
    const name = NameGenerator.generateName(actualSeed, gender);

    // Generate VitalState
    const vitalState = this.needsService.initializeVitalState(actualSeed, currentTime);

    // Generate Personality
    const basePersonality = {
      priceSensitivity: 30 + Math.floor(Math.random() * 60),
      qualityPreference: 30 + Math.floor(Math.random() * 60),
      conveniencePreference: 30 + Math.floor(Math.random() * 60),
      planningTendency: 30 + Math.floor(Math.random() * 60),
      socialEngagement: 30 + Math.floor(Math.random() * 60),
      riskTolerance: 30 + Math.floor(Math.random() * 60),
      savingTendency: 30 + Math.floor(Math.random() * 60)
    };

    const citizen: Citizen = {
      id,
      name,
      birthDate: actualBirthDate,
      gender,
      status: CitizenStatus.ACTIVE,
      createdAt: currentTime,
      locationId: null,
      vitalState,
      movementState: MovementState.IDLE,
      activeRoute: null,
      skills: SkillGenerator.generateSkills(actualSeed, AgeCalculator.calculateAge(actualBirthDate, currentTime)),
      employmentStatus: EmploymentStatus.UNEMPLOYED,
      workplaceId: null,
      jobType: null,
      jobSchedule: null,
      currentAction: undefined,
      currentRoutine: undefined,
      personality: basePersonality,
      wallet: {
        id: `wallet-${id}`,
        ownerId: id,
        balance: 1000,
        totalIncome: 0,
        totalExpenses: 0,
        currency: 'GEN'
      },
    };

    const age = new Date().getFullYear() - actualBirthDate.year;
    citizen.currentRoutine = this.routineEngine.generateRoutineWithAge(citizen, age);

    return citizen;
  }

  /**
   * Finalizes citizen registration and updates world population counts.
   */
  private finalizeCitizen(citizen: Citizen): Citizen {
    this.repository.create(citizen);
    
    if (citizen.locationId) {
      this.updatePopulationForLocation(citizen.locationId, 1);
    }
    this.worldEngine.worldManager.updatePopulation(1);

    return citizen;
  }

  /**
   * Creates and places a newborn citizen with dynamic household placement rules.
   */
  public createCitizenForNewborn(
    gender: CitizenGender,
    parent: Citizen,
    birthDate?: SimulationTime,
    seed?: number
  ): Citizen {
    const newborn = this.createBaseCitizen(gender, birthDate, seed);
    this.placementService.assignNewborn(newborn, parent);
    return this.finalizeCitizen(newborn);
  }

  /**
   * Creates and places an immigrant citizen with dynamic household placement rules.
   */
  public createCitizenForImmigrant(
    gender: CitizenGender,
    birthDate?: SimulationTime,
    preferredLocationId?: string | null,
    seed?: number
  ): Citizen {
    const immigrant = this.createBaseCitizen(gender, birthDate, seed);
    this.placementService.assignImmigrant(immigrant, preferredLocationId);
    return this.finalizeCitizen(immigrant);
  }

  /**
   * Creates a new citizen.
   * Ensures the location is valid and deterministically assigns identity if seed is provided.
   */
  public createCitizen(
    gender: CitizenGender,
    locationId: string | null = null,
    birthDate?: SimulationTime,
    seed?: number,
    options?: {
      householdId?: string | null;
      coordX?: number | null;
      coordY?: number | null;
      skipHouseholdCreation?: boolean;
    }
  ): Citizen {
    // Validate Location
    if (locationId) {
      this.validateLocation(locationId);
    }

    const citizen = this.createBaseCitizen(gender, birthDate, seed);

    if (options) {
      if (options.householdId) {
        citizen.householdId = options.householdId;
        citizen.locationId = locationId;
        if (options.coordX !== undefined && options.coordX !== null) citizen.coordX = options.coordX;
        if (options.coordY !== undefined && options.coordY !== null) citizen.coordY = options.coordY;
        this.householdService.addMember(options.householdId, citizen.id);
      } else if (options.skipHouseholdCreation) {
        citizen.householdId = undefined;
        citizen.locationId = locationId;
        if (options.coordX !== undefined && options.coordX !== null) citizen.coordX = options.coordX;
        if (options.coordY !== undefined && options.coordY !== null) citizen.coordY = options.coordY;
      } else {
        citizen.locationId = locationId;
      }
    } else if (locationId) {
      const building = this.worldEngine.buildingManager.getBuilding(locationId);
      if (building && (building.type === BuildingType.APARTMENT || building.type === BuildingType.HOUSE)) {
        this.placementService.assignImmigrant(citizen, locationId);
      } else {
        // Fallback for non-residential location IDs (e.g. unit tests testing regions)
        const household = this.householdService.createHousehold(locationId || '');
        this.householdService.addMember(household.id, citizen.id);
        this.householdService.provisionStarterResources(household.id);
        citizen.householdId = household.id;
        citizen.locationId = locationId;
      }
    } else {
      // Legacy fallback when no location is specified
      const household = this.householdService.createHousehold('');
      this.householdService.addMember(household.id, citizen.id);
      this.householdService.provisionStarterResources(household.id);
      citizen.householdId = household.id;
      citizen.locationId = null;
    }

    return this.finalizeCitizen(citizen);
  }

  public getCitizen(id: string): Citizen | undefined {
    return this.repository.findById(id);
  }

  public listCitizens(): Citizen[] {
    return this.repository.findAll();
  }

  public deleteCitizen(id: string): boolean {
    const citizen = this.repository.findById(id);
    if (!citizen) return false;

    // Decrement population
    if (citizen.status === CitizenStatus.ACTIVE) {
      this.updatePopulationForLocation(citizen.locationId, -1);
      this.worldEngine.worldManager.updatePopulation(-1);
    }

    return this.repository.delete(id);
  }

  /**
   * Returns the derived age using the current SimulationTime
   */
  public getCitizenAge(citizen: Citizen): number {
    return AgeCalculator.calculateAge(citizen.birthDate, this.timeEngine.getCurrentTime());
  }

  public tickCitizen(citizenId: string): void {
    const citizen = this.getCitizen(citizenId);
    if (!citizen || citizen.status !== CitizenStatus.ACTIVE || !citizen.locationId) return;

    // 0. Check health/death condition
    if (citizen.vitalState.health <= 0) {
      this.updateStatus(citizen.id, CitizenStatus.DECEASED);
      return;
    }

    // 1. Tick existing action
    this.actionExecutor.tick(citizen);

    const currentTime = this.timeEngine.getCurrentTime();
    
    // 2. Update routine activity
    citizen.currentRoutineActivity = this.routineEngine.getCurrentActivity(citizen, currentTime);

    // 3. Request decision if no active action or action just finished, decide next action
    if (!citizen.currentAction || 
        citizen.currentAction.state === ActionState.COMPLETED || 
        citizen.currentAction.state === ActionState.CANCELLED ||
        citizen.currentAction.state === ActionState.FAILED) {
        
        let homeId: string | undefined = undefined;
        let stockLevels: Record<string, number> = {};
        if (citizen.householdId) {
          const household = this.householdService.getHousehold(citizen.householdId);
          if (household) {
            homeId = household.locationId;
            const inventory = this.householdService['inventoryManager'].getInventory(household.inventoryId);
            if (inventory) {
              const currentTimeSeconds = this.timeEngine.getUptimeSeconds(); // or equivalent
              for (const [productId, item] of Object.entries(inventory.items)) {
                stockLevels[productId] = this.householdService['inventoryManager'].getUsableQuantity(inventory.id, productId, currentTimeSeconds);
              }
            }
          }
        }

        let workplaceLocationId: string | undefined = undefined;
        if (citizen.workplaceId) {
          const workplace = this.worldEngine.workplaceRepository.findById(citizen.workplaceId);
          if (workplace) {
            workplaceLocationId = workplace.locationId;
          }
        }

        const hasWaterConnection = homeId ? this.worldEngine.buildingManager.hasWaterConnection(homeId) : false;

        const context: DecisionContext = {
          citizenId: citizen.id,
          age: this.getCitizenAge(citizen),
          vitalState: citizen.vitalState,
          skills: citizen.skills,
          employmentStatus: citizen.employmentStatus,
          workplaceId: citizen.workplaceId,
          workplaceLocationId,
          currentLocationId: citizen.locationId || '',
          currentDestinationId: null,
          simulationTime: new Date() as any, // fallback or real simulation time mapped to Date
          perception: this.perceptionService!.generateSnapshot(citizen.id),
          householdId: citizen.householdId,
          homeId,
          hasWaterConnection,
          personality: citizen.personality,
          walletBalance: citizen.wallet?.balance ?? 0,
          stockLevels,
          currentRoutineActivity: citizen.currentRoutineActivity // Make sure this is in context!
        };

        const needStates = this.needAnalyzer.analyzeNeeds(citizen.vitalState);

        const candidates = this.candidateGenerator.generateCandidates(context, needStates);
        
        const candidateSet = {
          citizenId: citizen.id,
          timestamp: new Date() as any,
          triggeredNeeds: needStates,
          candidates
        };

        if (candidates.length > 0) {
          const decision = this.decisionEngine.requestDecision(context, candidateSet, DecisionTriggerType.PERIODIC_FALLBACK);
          if (decision && decision.selectedAction) {
            this.actionExecutor.executeAction(citizen, decision.selectedAction);
            this.repository.update(citizen);
          }
        }
    }
  }

  public retryUnhousedPlacements(): Citizen[] {
    return this.placementService.retryUnhousedPlacements(
      (id) => this.getCitizen(id)
    );
  }

  public clear(): void {
    this.repository.clear();
    this.householdService.clear();
    this.placementService.clear();
    citizenIdCounter = 1;
  }

  /**
   * Evolves a personality trait slightly based on observed behavior.
   */
  public evolvePersonality(citizenId: string, trait: keyof Citizen['personality'], delta: number): void {
    const citizen = this.getCitizen(citizenId);
    if (!citizen) return;

    let newValue = citizen.personality[trait] + delta;
    if (newValue > 100) newValue = 100;
    if (newValue < 0) newValue = 0;

    citizen.personality[trait] = newValue;
    this.repository.update(citizen);
  }

  /**
   * WorldEngine is authoritative for spatial hierarchy.
   * We only keep references. We must validate that the reference exists.
   */
  private validateLocation(locationId: string): void {
    // Try to find the location in the World Engine.
    // It could be a region, city, district, or building.
    const exists = 
      this.worldEngine.buildingManager.getBuilding(locationId) ||
      this.worldEngine.districtManager.getDistrict(locationId) ||
      this.worldEngine.cityManager.getCity(locationId) ||
      this.worldEngine.regionManager.getRegion(locationId);

    if (!exists) {
      throw new Error(`Location validation failed: Entity with ID ${locationId} does not exist in the World Engine.`);
    }
  }

  private updatePopulationForLocation(locationId: string | null, amount: number): void {
    const hierarchy = this.worldEngine.resolveLocationHierarchy(locationId);
    if (hierarchy.regionId) {
      this.worldEngine.regionManager.updatePopulation(hierarchy.regionId, amount);
    }
    if (hierarchy.cityId) {
      this.worldEngine.cityManager.updatePopulation(hierarchy.cityId, amount);
    }
  }

  /**
   * Called to update citizen location (migration)
   */
  public updateLocation(citizenId: string, newLocationId: string | null): void {
    const citizen = this.getCitizen(citizenId);
    if (!citizen) return;

    if (newLocationId) {
      this.validateLocation(newLocationId);
    }

    if (citizen.status === CitizenStatus.ACTIVE) {
      this.updatePopulationForLocation(citizen.locationId, -1);
      this.updatePopulationForLocation(newLocationId, 1);
    }

    citizen.locationId = newLocationId;
    this.repository.update(citizen);
  }

  /**
   * Called to update status (e.g., DECEASED)
   */
  public updateStatus(citizenId: string, status: CitizenStatus): void {
    const citizen = this.getCitizen(citizenId);
    if (!citizen || citizen.status === status) return;

    if (status === CitizenStatus.DECEASED && citizen.status === CitizenStatus.ACTIVE) {
      this.updatePopulationForLocation(citizen.locationId, -1);
      this.worldEngine.worldManager.updatePopulation(-1);
      
      // Release employment
      if (citizen.workplaceId) {
        const workplace = this.worldEngine.workplaceRepository.findById(citizen.workplaceId);
        if (workplace) {
          const position = workplace.positions.find(p => p.occupantId === citizenId);
          if (position) {
            position.occupantId = null;
            workplace.occupiedPositions = Math.max(0, workplace.occupiedPositions - 1);
            workplace.vacancies = Math.min(workplace.capacity, workplace.vacancies + 1);
            this.worldEngine.workplaceRepository.update(workplace);
          }
        }
        if (citizen.employmentRecord) {
          citizen.employmentRecord.endDate = { ...this.timeEngine.getCurrentTime() };
        }
      }
      citizen.employmentStatus = EmploymentStatus.UNEMPLOYED;
      citizen.workplaceId = null;
      citizen.jobType = null;
      citizen.jobSchedule = null;

      // Release household membership & unhoused tracking
      if (citizen.householdId) {
        this.householdService.removeMember(citizen.householdId, citizen.id);
        const hh = this.householdService.getHousehold(citizen.householdId);
        if (hh && hh.members.length === 0) {
          this.householdService.removeHousehold(citizen.householdId);
        }
        citizen.householdId = undefined;
      }
      this.placementService.untrackUnhoused(citizen.id);
    } else if (status === CitizenStatus.ACTIVE && citizen.status === CitizenStatus.DECEASED) {
      this.updatePopulationForLocation(citizen.locationId, 1);
      this.worldEngine.worldManager.updatePopulation(1);
    }

    citizen.status = status;
    this.repository.update(citizen);
  }
}
