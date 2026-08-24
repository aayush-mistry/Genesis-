import { MarketEngine } from '@genesis/engine';
import { worldService } from './world.service';
import { timeService } from './time.service';
import { eventService } from './event.service';
import { citizenService } from './citizen.service';
import { supplyService } from './supply.service';

class MarketService {
  public engine: MarketEngine;

  constructor() {
    this.engine = new MarketEngine(
      worldService.engine,
      timeService.engine,
      eventService.scheduler,
      (citizenId) => citizenService.engine.getCitizen(citizenId)?.wallet,
      supplyService.inventoryManager
    );
  }

  public initialize() {
    console.log('[Market Engine] Initialized');
  }
}

export const marketService = new MarketService();
