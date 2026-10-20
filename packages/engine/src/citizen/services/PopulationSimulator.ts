import { Citizen, CitizenGender, CitizenStatus, SimulationTime } from '@genesis/shared';
import { CitizenService } from './CitizenService';
import { TimeEngine } from '../../time/TimeEngine';
import { OccupationService } from './OccupationService';
import { WorkplaceGenerator } from '../../world/services/WorkplaceGenerator';

export interface DemographicEvent {
  type: 'BIRTH' | 'DEATH' | 'IMMIGRATION' | 'HOUSING_ASSIGNED' | 'JOB_ASSIGNED';
  citizen: Citizen;
  parent?: Citizen;
}

export class PopulationSimulator {
  private citizenService: CitizenService;
  private timeEngine: TimeEngine;
  private occupationService?: OccupationService;
  private workplaceGenerator?: WorkplaceGenerator;
  private lastProcessedYear: number = 0;
  private lastProcessedMonth: number = 0;
  private isSubscribed: boolean = false;
  public onDemographicEvent?: (event: DemographicEvent) => void;

  // Monthly Demographic Rates (assuming 12 months/year)
  private readonly MONTHLY_BIRTH_RATE = 0.02 / 12; // 2% annual birth rate
  private readonly MONTHLY_DEATH_RATE = 0.01 / 12; // 1% annual base death rate
  private readonly MONTHLY_MIGRATION_RATE = 0.005 / 12; // 0.5% annual migration growth

  constructor(
    citizenService: CitizenService, 
    timeEngine: TimeEngine, 
    occupationService?: OccupationService, 
    workplaceGenerator?: WorkplaceGenerator,
    private defaultLocationIdProvider?: () => string | null
  ) {
    this.citizenService = citizenService;
    this.timeEngine = timeEngine;
    this.occupationService = occupationService;
    this.workplaceGenerator = workplaceGenerator;
    
    // Bind the listener method so it can be added/removed properly
    this.onTimeTick = this.onTimeTick.bind(this);
  }

  public getOccupationService(): OccupationService | undefined {
    return this.occupationService;
  }

  public setOccupationService(occupationService: OccupationService): void {
    this.occupationService = occupationService;
  }

  public getWorkplaceGenerator(): WorkplaceGenerator | undefined {
    return this.workplaceGenerator;
  }

  public setWorkplaceGenerator(workplaceGenerator: WorkplaceGenerator): void {
    this.workplaceGenerator = workplaceGenerator;
  }

  /**
   * Initializes the world with the given number of citizens.
   */
  public initializePopulation(count: number): void {
    console.log(`[PopulationSimulator] Initializing world with ${count} citizens...`);
    const currentTime = this.timeEngine.getCurrentTime();

    for (let i = 0; i < count; i++) {
      // Create a random mix of genders (simplified for initial seed)
      const genderSeed = Math.random();
      let gender = CitizenGender.MALE;
      if (genderSeed > 0.5) gender = CitizenGender.FEMALE;
      if (genderSeed > 0.98) gender = CitizenGender.OTHER;

      // Assign a random age between 0 and 70 for the initial population
      const ageYears = Math.floor(Math.random() * 70);
      const birthDate = { ...currentTime };
      birthDate.year -= ageYears;

      const locationId = this.defaultLocationIdProvider ? this.defaultLocationIdProvider() : null;
      this.citizenService.createCitizen(gender, locationId, birthDate);
    }

    if (this.workplaceGenerator) {
      console.log(`[PopulationSimulator] Generating workplaces...`);
      this.workplaceGenerator.generateWorkplaces();
    }

    if (this.occupationService) {
      console.log(`[PopulationSimulator] Assigning jobs...`);
      this.occupationService.runJobAssignment();
    }
  }

  public start(): void {
    if (this.isSubscribed) return;
    
    const time = this.timeEngine.getCurrentTime();
    this.lastProcessedYear = time.year;
    this.lastProcessedMonth = time.month;

    this.timeEngine.subscribe(this.onTimeTick);
    this.isSubscribed = true;
    console.log('[PopulationSimulator] Started.');
  }

  public stop(): void {
    if (!this.isSubscribed) return;
    
    this.timeEngine.unsubscribe(this.onTimeTick);
    this.isSubscribed = false;
    console.log('[PopulationSimulator] Stopped.');
  }

  private onTimeTick(time: SimulationTime): void {
    // Tick all citizens every simulation step to progress their actions
    const citizens = this.citizenService.listCitizens().filter(c => c.status === CitizenStatus.ACTIVE);
    for (const citizen of citizens) {
      this.citizenService.tickCitizen(citizen.id);
    }

    // Process demographics once per simulation month
    if (time.year > this.lastProcessedYear || 
       (time.year === this.lastProcessedYear && time.month > this.lastProcessedMonth)) {
      
      this.processDemographics(time);
      this.lastProcessedYear = time.year;
      this.lastProcessedMonth = time.month;
    }
  }

  public processDemographics(currentTime: SimulationTime): void {
    const citizens = this.citizenService.listCitizens().filter(c => c.status === CitizenStatus.ACTIVE);
    const populationSize = citizens.length;

    if (populationSize === 0) return;

    let newBirths = 0;
    let newDeaths = 0;
    let newImmigrants = 0;

    // 1. Calculate Births
    for (let i = 0; i < populationSize; i++) {
      if (Math.random() < this.MONTHLY_BIRTH_RATE) {
        newBirths++;
        const gender = Math.random() > 0.5 ? CitizenGender.FEMALE : CitizenGender.MALE;
        const parent = citizens[i];
        const newborn = this.citizenService.createCitizenForNewborn(gender, parent, { ...currentTime });
        if (this.onDemographicEvent) {
          this.onDemographicEvent({ type: 'BIRTH', citizen: newborn, parent });
        }
      }
    }

    // 2. Calculate Deaths
    for (const citizen of citizens) {
      const age = this.citizenService.getCitizenAge(citizen);
      let individualDeathRate = this.MONTHLY_DEATH_RATE;

      // Age scales death probability
      if (age > 60) {
        individualDeathRate += (age - 60) * 0.001; // Increase risk significantly after 60
      }

      if (Math.random() < individualDeathRate) {
        newDeaths++;
        this.citizenService.updateStatus(citizen.id, CitizenStatus.DECEASED);
        if (this.onDemographicEvent) {
          this.onDemographicEvent({ type: 'DEATH', citizen });
        }
      }
    }

    // 3. Calculate Migration (Net Positive Immigration)
    for (let i = 0; i < populationSize; i++) {
        if (Math.random() < this.MONTHLY_MIGRATION_RATE) {
            newImmigrants++;
            const gender = Math.random() > 0.5 ? CitizenGender.FEMALE : CitizenGender.MALE;
            // Immigrants arrive as young adults typically (e.g. 20-30 years old)
            const ageYears = 20 + Math.floor(Math.random() * 10);
            const birthDate = { ...currentTime };
            birthDate.year -= ageYears;
            const locationId = this.defaultLocationIdProvider ? this.defaultLocationIdProvider() : null;
            const immigrant = this.citizenService.createCitizenForImmigrant(gender, birthDate, locationId);
            if (this.onDemographicEvent) {
              this.onDemographicEvent({ type: 'IMMIGRATION', citizen: immigrant });
            }
        }
    }

    // 4. Retry unhoused placements if capacity has become available
    const newlyPlaced = this.citizenService.retryUnhousedPlacements();
    for (const citizen of newlyPlaced) {
      if (this.onDemographicEvent) {
        this.onDemographicEvent({ type: 'HOUSING_ASSIGNED', citizen });
      }
    }

    // 5. Dynamic Job Assignment
    if (this.occupationService) {
      const assignedCitizens = this.occupationService.runJobAssignment();
      for (const citizen of assignedCitizens) {
        if (this.onDemographicEvent) {
          this.onDemographicEvent({ type: 'JOB_ASSIGNED', citizen });
        }
      }
    }
  }
}
