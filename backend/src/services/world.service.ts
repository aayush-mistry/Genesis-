import { WorldEngine } from '@genesis/engine';

class WorldService {
  public engine: WorldEngine;

  constructor() {
    this.engine = new WorldEngine();
    // Auto-initialize a default world on startup
    this.engine.worldManager.createWorld('Genesis Prime', 'The first simulation world.', Date.now());
  }
}

export const worldService = new WorldService();
