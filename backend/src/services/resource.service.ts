import { ResourceEngine } from '@genesis/engine';
import { worldService } from './world.service';
import { environmentService } from './environment.service';
import { eventService } from './event.service';
import { timeService } from './time.service';

class ResourceService {
  public engine: ResourceEngine;

  constructor() {
    this.engine = new ResourceEngine(
      worldService.engine,
      environmentService.engine,
      eventService.scheduler,
      timeService.engine
    );
  }

  public initialize(): void {
    this.engine.initialize();
  }
}

export const resourceService = new ResourceService();
