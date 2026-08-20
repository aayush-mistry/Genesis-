import { Citizen, VitalState, SimulationTime } from '@genesis/shared';
import { SeededRandom } from '../../utils/SeededRandom';
import { TimeUtils } from '../../utils/TimeUtils';
import { EventScheduler } from '../../events/EventScheduler';
import { CitizenRepository } from '../repositories/CitizenRepository';

export const NeedsConfig = {
  HUNGER_RATE_PER_HOUR: 1.5,
  THIRST_RATE_PER_HOUR: 2.5,
  ENERGY_DRAIN_PER_HOUR: 0.0,
  ENERGY_RECOVERY_PER_HOUR: 0.0,
};

export class NeedsService {
  private repository: CitizenRepository;

  constructor(repository: CitizenRepository) {
    this.repository = repository;
  }

  /**
   * Generates a deterministic initial VitalState based on the provided seed.
   */
  public initializeVitalState(seed: number, currentTime: SimulationTime): VitalState {
    const rng = new SeededRandom(seed);
    
    return {
      // Start relatively satisfied
      hunger: rng.nextFloat(0, 20),
      thirst: rng.nextFloat(0, 20),
      // Start with high energy
      energy: rng.nextFloat(80, 100),
      // Start fully healthy
      health: 100,
      lastUpdatedSimulationTime: TimeUtils.clone(currentTime),
    };
  }

  /**
   * Calculates how much simulation time has passed and updates needs accordingly.
   */
  public updateNeeds(citizen: Citizen, currentTime: SimulationTime): void {
    const lastTime = citizen.vitalState.lastUpdatedSimulationTime;
    
    const elapsedHours = this.calculateElapsedHours(lastTime, currentTime);
    
    if (elapsedHours <= 0) return;

    citizen.vitalState.hunger += elapsedHours * NeedsConfig.HUNGER_RATE_PER_HOUR;
    citizen.vitalState.thirst += elapsedHours * NeedsConfig.THIRST_RATE_PER_HOUR;
    citizen.vitalState.energy -= elapsedHours * NeedsConfig.ENERGY_DRAIN_PER_HOUR;
    citizen.vitalState.energy += elapsedHours * NeedsConfig.ENERGY_RECOVERY_PER_HOUR;

    this.clampVitalState(citizen.vitalState);

    citizen.vitalState.lastUpdatedSimulationTime = TimeUtils.clone(currentTime);
    this.repository.update(citizen);
  }

  /**
   * Updates all active citizens' needs.
   */
  public updatePopulationNeeds(currentTime: SimulationTime): void {
    const citizens = this.repository.findAll().filter(c => c.status === 'ACTIVE');
    for (const citizen of citizens) {
      this.updateNeeds(citizen, currentTime);
    }
  }

  public scheduleNeedsUpdate(eventScheduler: EventScheduler, currentTime: SimulationTime): void {
    // Schedule the first update to occur in 1 hour
    const nextTime = TimeUtils.clone(currentTime);
    nextTime.hour += 1;
    if (nextTime.hour >= 24) {
      nextTime.hour -= 24;
      nextTime.day += 1;
    }

    eventScheduler.scheduleEvent({
      id: 'system-needs-update-event',
      name: 'Population Needs Update',
      description: 'Hourly update for all citizens vital states',
      priority: 'Normal',
      status: 'Scheduled',
      createdTime: TimeUtils.clone(currentTime),
      scheduledTime: nextTime,
      sourceModule: 'NeedsEngine',
      targetModule: 'CitizenEngine',
      cancelFlag: false,
      retryCount: 0,
      recurrence: { interval: 'Hour' },
      handler: async (event) => {
        // Use the event's execution time as the current time
        this.updatePopulationNeeds(event.executionTime!);
      }
    });
  }

  public consumeEnergy(citizen: Citizen, amount: number): void {
    citizen.vitalState.energy -= amount;
    this.clampVitalState(citizen.vitalState);
    this.repository.update(citizen);
  }

  public recoverEnergy(citizen: Citizen, amount: number): void {
    citizen.vitalState.energy += amount;
    this.clampVitalState(citizen.vitalState);
    this.repository.update(citizen);
  }

  public damageHealth(citizen: Citizen, amount: number): void {
    citizen.vitalState.health -= amount;
    this.clampVitalState(citizen.vitalState);
    this.repository.update(citizen);
  }

  public restoreHealth(citizen: Citizen, amount: number): void {
    citizen.vitalState.health += amount;
    this.clampVitalState(citizen.vitalState);
    this.repository.update(citizen);
  }

  public satisfyHunger(citizen: Citizen, amount: number): void {
    citizen.vitalState.hunger -= amount;
    this.clampVitalState(citizen.vitalState);
    this.repository.update(citizen);
  }

  public satisfyThirst(citizen: Citizen, amount: number): void {
    citizen.vitalState.thirst -= amount;
    this.clampVitalState(citizen.vitalState);
    this.repository.update(citizen);
  }

  private clampVitalState(state: VitalState): void {
    state.hunger = this.clamp(state.hunger, 0, 100);
    state.thirst = this.clamp(state.thirst, 0, 100);
    state.energy = this.clamp(state.energy, 0, 100);
    state.health = this.clamp(state.health, 0, 100);
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  private calculateElapsedHours(from: SimulationTime, to: SimulationTime): number {
    // Basic calculation for elapsed hours assuming 30 days/month, 12 months/year, 24 hours/day
    const fromHours = 
      from.year * 12 * 30 * 24 + 
      from.month * 30 * 24 + 
      from.day * 24 + 
      from.hour + 
      from.minute / 60 + 
      from.second / 3600;

    const toHours = 
      to.year * 12 * 30 * 24 + 
      to.month * 30 * 24 + 
      to.day * 24 + 
      to.hour + 
      to.minute / 60 + 
      to.second / 3600;

    return toHours - fromHours;
  }
}
