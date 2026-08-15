import { Citizen, CitizenGender, CitizenStatus, SimulationTime } from '@genesis/shared';
import { CitizenRepository } from '../repositories/CitizenRepository';
import { NameGenerator } from '../generators/NameGenerator';
import { AgeCalculator } from './AgeCalculator';
import { WorldEngine } from '../../world/WorldEngine';
import { TimeEngine } from '../../time/TimeEngine';

let citizenIdCounter = 1;

export class CitizenService {
  private repository: CitizenRepository;
  private worldEngine: WorldEngine;
  private timeEngine: TimeEngine;

  constructor(repository: CitizenRepository, worldEngine: WorldEngine, timeEngine: TimeEngine) {
    this.repository = repository;
    this.worldEngine = worldEngine;
    this.timeEngine = timeEngine;
  }

  /**
   * Creates a new citizen.
   * Ensures the location is valid and deterministically assigns identity if seed is provided.
   */
  public createCitizen(
    gender: CitizenGender,
    locationId: string | null = null,
    birthDate?: SimulationTime,
    seed?: number
  ): Citizen {
    // Validate Location
    if (locationId) {
      this.validateLocation(locationId);
    }

    const currentTime = this.timeEngine.getCurrentTime();
    const actualBirthDate = birthDate || currentTime;
    
    // Identity Generation
    const id = `citizen-${citizenIdCounter.toString().padStart(6, '0')}`;
    citizenIdCounter++;

    // Generate Name Deterministically if seed provided, otherwise fallback to id-based seed
    const actualSeed = seed !== undefined ? seed : parseInt(id.replace('citizen-', ''), 10);
    const name = NameGenerator.generateName(actualSeed, gender);

    const citizen: Citizen = {
      id,
      name,
      birthDate: actualBirthDate,
      gender,
      status: CitizenStatus.ACTIVE,
      createdAt: currentTime,
      locationId
    };

    this.repository.create(citizen);
    return citizen;
  }

  public getCitizen(id: string): Citizen | undefined {
    return this.repository.findById(id);
  }

  public listCitizens(): Citizen[] {
    return this.repository.findAll();
  }

  public deleteCitizen(id: string): boolean {
    return this.repository.delete(id);
  }

  /**
   * Returns the derived age using the current SimulationTime
   */
  public getCitizenAge(citizen: Citizen): number {
    return AgeCalculator.calculateAge(citizen.birthDate, this.timeEngine.getCurrentTime());
  }

  public clear(): void {
    this.repository.clear();
    citizenIdCounter = 1;
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
}
