import { FinancialEngine } from '@genesis/engine';
import { worldService } from './world.service';
import { marketService } from './market.service';
import { eventService } from './event.service';
import { timeService } from './time.service';

class FinanceService {
  public engine: FinancialEngine;

  constructor() {
    this.engine = new FinancialEngine(
      worldService.engine,
      marketService.engine,
      eventService.scheduler,
      timeService.engine
    );
  }

  public initialize() {
    console.log('[Finance Service] Initialized');
  }
}

export const financeService = new FinanceService();
