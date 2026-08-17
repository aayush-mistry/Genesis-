import { CitizenGender, CitizenStatus, SimulationTime } from '@genesis/shared';
import { CitizenService } from './CitizenService';
import { TimeEngine } from '../../time/TimeEngine';

export class PopulationSimulator {
  private citizenService: CitizenService;
  private timeEngine: TimeEngine;
  private lastProcessedYear: number = 0;
  private lastProcessedMonth: number = 0;
  private isSubscribed: boolean = false;

  // Monthly Demographic Rates (assuming 12 months/year)
  private readonly MONTHLY_BIRTH_RATE = 0.02 / 12; // 2% annual birth rate
  private readonly MONTHLY_DEATH_RATE = 0.01 / 12; // 1% annual base death rate
  private readonly MONTHLY_MIGRATION_RATE = 0.005 / 12; // 0.5% annual migration growth

  constructor(citizenService: CitizenService, timeEngine: TimeEngine) {
    this.citizenService = citizenService;
    this.timeEngine = timeEngine;
    
    // Bind the listener method so it can be added/removed properly
    this.onTimeTick = this.onTimeTick.bind(this);
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

      this.citizenService.createCitizen(gender, null, birthDate);
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
    // Process demographics once per simulation month
    if (time.year > this.lastProcessedYear || 
       (time.year === this.lastProcessedYear && time.month > this.lastProcessedMonth)) {
      
      this.processDemographics(time);
      this.lastProcessedYear = time.year;
      this.lastProcessedMonth = time.month;
    }
  }

  private processDemographics(currentTime: SimulationTime): void {
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
        this.citizenService.createCitizen(gender, null, { ...currentTime });
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
        citizen.status = CitizenStatus.DECEASED;
        // Ideally update through repository
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
            this.citizenService.createCitizen(gender, null, birthDate);
        }
    }
  }
}
