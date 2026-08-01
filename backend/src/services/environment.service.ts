import { EnvironmentEngine } from '@genesis/engine';
import { worldService } from './world.service';
import { eventService } from './event.service';
import { timeService } from './time.service';

class EnvironmentService {
  public engine: EnvironmentEngine;

  constructor() {
    this.engine = new EnvironmentEngine(
      worldService.engine,
      eventService.scheduler,
      timeService.engine
    );
  }

  public initialize(): void {
    this.engine.initialize();
  }
}

export const environmentService = new EnvironmentService();
