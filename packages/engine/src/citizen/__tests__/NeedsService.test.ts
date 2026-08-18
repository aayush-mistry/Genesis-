import { NeedsService, NeedsConfig } from '../services/NeedsService';
import { InMemoryCitizenRepository } from '../repositories/InMemoryCitizenRepository';
import { Citizen, CitizenGender, CitizenStatus, SimulationTime, VitalState, MovementState } from '@genesis/shared';
import { EventScheduler } from '../../events/EventScheduler';
import { TimeEngine } from '../../time/TimeEngine';

describe('NeedsService', () => {
  let repository: InMemoryCitizenRepository;
  let needsService: NeedsService;

  beforeEach(() => {
    repository = new InMemoryCitizenRepository();
    needsService = new NeedsService(repository);
  });

  const createDummyCitizen = (vitalState: VitalState): Citizen => ({
    id: 'citizen-001',
    name: 'Test Citizen',
    birthDate: { year: 1, month: 1, day: 1, hour: 0, minute: 0, second: 0 },
    gender: CitizenGender.MALE,
    status: CitizenStatus.ACTIVE,
    createdAt: { year: 1, month: 1, day: 1, hour: 0, minute: 0, second: 0 },
    locationId: null,
    vitalState,
    movementState: MovementState.IDLE,
    activeRoute: null,
    skills: [],
    employmentStatus: 'UNEMPLOYED' as any,
    workplaceId: null,
    jobType: null,
    jobSchedule: null
  });

  it('initializes deterministically based on seed', () => {
    const time: SimulationTime = { year: 1, month: 1, day: 1, hour: 0, minute: 0, second: 0 };
    
    const vitals1 = needsService.initializeVitalState(12345, time);
    const vitals2 = needsService.initializeVitalState(12345, time);
    const vitals3 = needsService.initializeVitalState(99999, time);

    expect(vitals1.hunger).toBe(vitals2.hunger);
    expect(vitals1.thirst).toBe(vitals2.thirst);
    expect(vitals1.energy).toBe(vitals2.energy);
    
    // Different seed should ideally produce different results
    expect(vitals1.hunger).not.toBe(vitals3.hunger);
  });

  it('updates needs based on elapsed simulation hours', () => {
    const startTime: SimulationTime = { year: 1, month: 1, day: 1, hour: 8, minute: 0, second: 0 };
    const citizen = createDummyCitizen({
      hunger: 10,
      thirst: 10,
      energy: 100,
      health: 100,
      lastUpdatedSimulationTime: startTime
    });
    repository.create(citizen);

    // Advance 10 simulation hours
    const newTime: SimulationTime = { year: 1, month: 1, day: 1, hour: 18, minute: 0, second: 0 };
    
    needsService.updateNeeds(citizen, newTime);

    expect(citizen.vitalState.hunger).toBe(10 + (10 * NeedsConfig.HUNGER_RATE_PER_HOUR));
    expect(citizen.vitalState.thirst).toBe(10 + (10 * NeedsConfig.THIRST_RATE_PER_HOUR));
    expect(citizen.vitalState.energy).toBe(100 - (10 * NeedsConfig.ENERGY_DRAIN_PER_HOUR));
    expect(citizen.vitalState.lastUpdatedSimulationTime).toEqual(newTime);
  });

  it('clamps vital state values strictly between 0 and 100', () => {
    const startTime: SimulationTime = { year: 1, month: 1, day: 1, hour: 8, minute: 0, second: 0 };
    const citizen = createDummyCitizen({
      hunger: 90,
      thirst: 90,
      energy: 100,
      health: 100,
      lastUpdatedSimulationTime: startTime
    });
    repository.create(citizen);

    // Advance enough time to easily overflow limits
    const newTime: SimulationTime = { year: 1, month: 1, day: 5, hour: 8, minute: 0, second: 0 }; // 4 days later
    
    needsService.updateNeeds(citizen, newTime);

    expect(citizen.vitalState.hunger).toBe(100);
    expect(citizen.vitalState.thirst).toBe(100);
  });

  it('does not change vitals when simulation is paused (no time elapsed)', () => {
    const startTime: SimulationTime = { year: 1, month: 1, day: 1, hour: 8, minute: 0, second: 0 };
    const citizen = createDummyCitizen({
      hunger: 20,
      thirst: 20,
      energy: 80,
      health: 100,
      lastUpdatedSimulationTime: startTime
    });
    repository.create(citizen);

    needsService.updateNeeds(citizen, startTime);

    expect(citizen.vitalState.hunger).toBe(20);
    expect(citizen.vitalState.thirst).toBe(20);
  });

  it('schedules needs update with EventScheduler', () => {
    const timeEngine = new TimeEngine();
    const eventScheduler = new EventScheduler(timeEngine);
    const time: SimulationTime = { year: 1, month: 1, day: 1, hour: 8, minute: 0, second: 0 };
    
    needsService.scheduleNeedsUpdate(eventScheduler, time);
    
    const events = eventScheduler.getUpcomingEvents();
    expect(events.length).toBe(1);
    expect(events[0].id).toBe('system-needs-update-event');
    expect(events[0].recurrence?.interval).toBe('Hour');
    expect(events[0].scheduledTime.hour).toBe(9); // Scheduled for next hour
  });
});
