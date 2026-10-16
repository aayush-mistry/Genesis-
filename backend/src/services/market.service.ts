import { MarketEngine, PriceFormationService } from '@genesis/engine';
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
      (citizenId) => citizenService.engine.getCitizen(citizenId)?.wallet
    );
  }

  public initialize() {
    const priceFormationService = new PriceFormationService(
      worldService.engine,
      supplyService.inventoryManager,
      (productId: string) => supplyService.productionEngine.commodities.get(productId)
    );
    this.engine.setPriceFormationService(priceFormationService);

    // Wire productionCostCalculator for real producer reservation pricing
    import('./finance.service').then(({ financeService }) => {
      priceFormationService.setProductionCostCalculator(financeService.engine.productionCostCalculator);
    });

    // Explicitly inject marketEngine into supplyService
    supplyService.setMarketEngine(this.engine);

    console.log('[Market Engine] Initialized with PriceFormationService');
  }
}

export const marketService = new MarketService();
