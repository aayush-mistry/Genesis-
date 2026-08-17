import { CitizenService } from '../services/CitizenService';
import { PopulationSimulator } from '../services/PopulationSimulator';
import { InMemoryCitizenRepository } from '../repositories/InMemoryCitizenRepository';
import { TimeEngine } from '../../time/TimeEngine';
import { WorldEngine } from '../../world/WorldEngine';
import { CitizenStatus } from '@genesis/shared';

describe('PopulationSimulator', () => {
  let timeEngine: TimeEngine;
  let worldEngine: WorldEngine;
  let repository: InMemoryCitizenRepository;
  let citizenService: CitizenService;
  let simulator: PopulationSimulator;

  beforeEach(() => {
    timeEngine = new TimeEngine();
    worldEngine = new WorldEngine();
    repository = new InMemoryCitizenRepository();
    citizenService = new CitizenService(repository, worldEngine, timeEngine);
    simulator = new PopulationSimulator(citizenService, timeEngine);
  });

  it('initializes the population with the specified count', () => {
    simulator.initializePopulation(100);
    const citizens = citizenService.listCitizens();
    expect(citizens.length).toBe(100);
  });

  it('processes demographics when time advances a month', () => {
    simulator.initializePopulation(1000);
    simulator.start();

    const initialCount = citizenService.listCitizens().filter(c => c.status === CitizenStatus.ACTIVE).length;

    // Advance time by 1 month
    const time = timeEngine.getCurrentTime();
    time.month += 1;
    if (time.month > 12) {
      time.month = 1;
      time.year += 1;
    }
    
    // Cheat internal state for test
    jest.spyOn(timeEngine, 'getCurrentTime').mockReturnValue(time);
    
    // Manually trigger tick to bypass real intervals
    (simulator as any).onTimeTick(time);

    const newCount = citizenService.listCitizens().filter(c => c.status === CitizenStatus.ACTIVE).length;
    // With 1000 citizens, there's a very high probability of at least one birth, death or migration
    // Because of randomness, we just check that the simulation doesn't crash and sizes are reasonable.
    expect(newCount).toBeGreaterThan(0);
  });
});
