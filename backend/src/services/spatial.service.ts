import { SpatialEngine } from '@genesis/engine';
import { worldService } from './world.service';
import { eventService } from './event.service';

class SpatialService {
  public engine: SpatialEngine;

  constructor() {
    this.engine = new SpatialEngine(
      worldService.engine,
      eventService.scheduler
    );
  }

  public initialize(): void {
    // Note: In a real system, we must ensure worldService is initialized first
    this.engine.initialize();
  }
}

export const spatialService = new SpatialService();
