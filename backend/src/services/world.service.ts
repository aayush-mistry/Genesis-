import { WorldEngine } from '@genesis/engine';

class WorldService {
  public engine: WorldEngine;

  constructor() {
    this.engine = new WorldEngine();
  }
}

export const worldService = new WorldService();
