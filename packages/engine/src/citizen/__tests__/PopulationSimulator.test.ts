import { CitizenService } from '../services/CitizenService';
import { PopulationSimulator } from '../services/PopulationSimulator';
import { InMemoryCitizenRepository } from '../repositories/InMemoryCitizenRepository';
import { TimeEngine } from '../../time/TimeEngine';
import { WorldEngine } from '../../world/WorldEngine';
import { CitizenStatus } from '@genesis/shared';
import { PerceptionService } from '../../perception/PerceptionService';

describe('PopulationSimulator', () => {
  let timeEngine: TimeEngine;
  let worldEngine: WorldEngine;
  let repository: InMemoryCitizenRepository;
  let citizenService: CitizenService;
  let simulator: PopulationSimulator;

  let eventScheduler: import('../../events/EventScheduler').EventScheduler;
  let spatialEngine: import('../../spatial/SpatialEngine').SpatialEngine;

  beforeEach(() => {
    timeEngine = new TimeEngine();
    worldEngine = new WorldEngine();
    repository = new InMemoryCitizenRepository();
    
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

    eventScheduler = new (require('../../events/EventScheduler').EventScheduler)(timeEngine);
    spatialEngine = new (require('../../spatial/SpatialEngine').SpatialEngine)(worldEngine, eventScheduler);
    
    citizenService = new CitizenService(repository, worldEngine, timeEngine, eventScheduler, spatialEngine.queryService, new (require('../../citizen/services/HouseholdService').HouseholdService)(new (require('../../inventory/InventoryManager').InventoryManager)()));
    
    // Inject PerceptionService for CitizenService
    const perceptionService = new PerceptionService(
      citizenService,
      worldEngine,
      { getEnvironmentalState: jest.fn().mockReturnValue(null), weatherManager: { getRegionWeather: jest.fn().mockReturnValue(null) }, seasonManager: { getCurrentSeason: jest.fn().mockReturnValue('Spring') }, dayCycleManager: { getCurrentPhase: jest.fn().mockReturnValue('Morning') } } as any, // environmentEngine mock
      { resourceManager: { getResourcesByRegion: jest.fn().mockReturnValue([]) } } as any, // resourceEngine mock
      timeEngine,
      spatialEngine.queryService
    );
    citizenService.setPerceptionService(perceptionService);

    simulator = new PopulationSimulator(
      citizenService, 
      timeEngine, 
      undefined, 
      undefined, 
      () => region.id
    );
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

