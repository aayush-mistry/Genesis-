import { CitizenService, InMemoryCitizenRepository, PopulationSimulator } from '@genesis/engine';
import { worldService } from './world.service';
import { timeService } from './time.service';
import { eventService } from './event.service';
import { spatialService } from './spatial.service';

class BackendCitizenService {
  public engine: CitizenService;
  public simulator: PopulationSimulator;

  constructor() {
    const repository = new InMemoryCitizenRepository();
    this.engine = new CitizenService(
      repository, 
      worldService.engine, 
      timeService.engine,
      eventService.scheduler,
      spatialService.engine.queryService
    );
    this.simulator = new PopulationSimulator(
      this.engine, 
      timeService.engine,
      undefined,
      undefined,
      () => {
        const regions = worldService.engine.regionManager.getAllRegions();
        return regions.length > 0 ? regions[0].id : null;
      }
    );
  }

  public initialize() {
    // In the future, this might load existing citizens from a database.
    this.simulator.start();
    
    // Schedule Needs updates
    this.engine.needsService.scheduleNeedsUpdate(eventService.scheduler, timeService.engine.getCurrentTime());
    
    console.log('[Citizen Engine] Initialized and Simulator started');
  }
}

export const citizenService = new BackendCitizenService();
