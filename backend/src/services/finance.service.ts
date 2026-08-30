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
    // Note: citizenService is required here for salary calculations
    import('./citizen.service').then(({ citizenService }) => {
      this.engine.productionCostCalculator.citizenProvider = (id) => citizenService.engine.getCitizen(id);
    });
    console.log('[Finance Service] Initialized');
  }
}

export const financeService = new FinanceService();
