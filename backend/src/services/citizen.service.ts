import { CitizenService, InMemoryCitizenRepository } from '@genesis/engine';
import { worldService } from './world.service';
import { timeService } from './time.service';

class BackendCitizenService {
  public engine: CitizenService;

  constructor() {
    const repository = new InMemoryCitizenRepository();
    this.engine = new CitizenService(repository, worldService.engine, timeService.engine);
  }

  public initialize() {
    // In the future, this might load existing citizens from a database.
    console.log('[Citizen Engine] Initialized');
  }
}

export const citizenService = new BackendCitizenService();
