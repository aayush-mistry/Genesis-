import { Citizen, VitalState, SimulationTime } from '@genesis/shared';
import { SeededRandom } from '../../utils/SeededRandom';
import { TimeUtils } from '../../utils/TimeUtils';
import { EventScheduler } from '../../events/EventScheduler';
import { CitizenRepository } from '../repositories/CitizenRepository';

import { EventRegistry } from '../../events/EventRegistry';

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
    
    EventRegistry.register('NeedsService.updatePopulationNeeds', async (event) => {
      this.updatePopulationNeeds(event.executionTime!);
    });
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

  public updateNeeds(citizen: Citizen, currentTime: SimulationTime): void {
    const lastTime = citizen.vitalState.lastUpdatedSimulationTime;
    
    const elapsedHours = this.calculateElapsedHours(lastTime, currentTime);
    
    if (elapsedHours <= 0) return;

    citizen.vitalState.hunger += elapsedHours * NeedsConfig.HUNGER_RATE_PER_HOUR;
    citizen.vitalState.thirst += elapsedHours * NeedsConfig.THIRST_RATE_PER_HOUR;

    // Determine energy modifier based on current action or routine activity
    let energyModifier = NeedsConfig.ENERGY_DRAIN_PER_HOUR; // Base drain
    
    // Activity-based modifiers
    const actionType = citizen.currentAction?.actionType;
    const routineType = citizen.currentRoutineActivity?.type;

    if (actionType === 'REST' || routineType === 'SLEEP' || routineType === 'REST') {
      energyModifier = -10.0; // Recover energy
    } else if (actionType === 'WORK' || routineType === 'WORK') {
      energyModifier = 5.0; // Drain faster
    } else if (routineType === 'EXERCISE') {
      energyModifier = 15.0; // Drain very fast
    }
    
    // Apply Action Modifiers
    if (citizen.currentAction?.state === 'IN_PROGRESS') {
      if (citizen.currentAction.actionType === 'WORK') {
        energyModifier -= 3.0; // Hard work drains more energy
      } else if (citizen.currentAction.actionType === 'REST') {
        energyModifier += 4.0; // Extra rest bonus
      }
    } else if (actionType === 'GO_TO_WORK' || actionType === 'GO_TO_SCHOOL' || actionType === 'GO_TO_FOOD_SOURCE') {
      energyModifier = 3.0; // Travel drain
    }

    citizen.vitalState.energy -= elapsedHours * energyModifier;
    
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
      handlerName: 'NeedsService.updatePopulationNeeds'
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
