import { PerceptionService } from '@genesis/engine';
import { citizenService } from './citizen.service';
import { worldService } from './world.service';
import { environmentService } from './environment.service';
import { resourceService } from './resource.service';
import { timeService } from './time.service';
import { spatialService } from './spatial.service';

class BackendPerceptionService {
  public engine: PerceptionService;

  constructor() {
    this.engine = new PerceptionService(
      citizenService.engine,
      worldService.engine,
      environmentService.engine,
      resourceService.engine,
      timeService.engine,
      spatialService.engine.queryService
    );
  }

  public initialize() {
    citizenService.engine.setPerceptionService(this.engine);
    console.log('[Perception Engine] Initialized');
  }
}

export const perceptionService = new BackendPerceptionService();
