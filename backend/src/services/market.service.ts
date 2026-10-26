import { MarketEngine, PriceFormationService, ProductionCostCalculator } from '@genesis/engine';
import { worldService } from './world.service';
import { timeService } from './time.service';
import { eventService } from './event.service';
import { citizenService } from './citizen.service';
import { supplyService } from './supply.service';

class MarketService {
  public engine: MarketEngine;
  public priceFormationService?: PriceFormationService;

  constructor() {
    this.engine = new MarketEngine(
      worldService.engine,
      timeService.engine,
      eventService.scheduler,
      (citizenId) => citizenService.engine.getCitizen(citizenId)?.wallet
    );
  }

  public setProductionCostCalculator(calculator: ProductionCostCalculator): void {
    if (this.priceFormationService) {
      this.priceFormationService.setProductionCostCalculator(calculator);
    }
  }

  public initialize(productionCostCalculator?: ProductionCostCalculator): void {
    this.priceFormationService = new PriceFormationService(
      worldService.engine,
      supplyService.inventoryManager,
      (productId: string) => supplyService.productionEngine.commodities.get(productId)
    );
    this.engine.setPriceFormationService(this.priceFormationService);

    // Wire calculator synchronously if passed or if financeService is already loaded
    if (productionCostCalculator) {
      this.priceFormationService.setProductionCostCalculator(productionCostCalculator);
    } else {
      try {
        const { financeService } = require('./finance.service');
        if (financeService?.engine?.productionCostCalculator) {
          this.priceFormationService.setProductionCostCalculator(financeService.engine.productionCostCalculator);
        }
      } catch (e) {
        // Ignored if finance.service is still resolving
      }
    }

    // Explicitly inject marketEngine into supplyService
    supplyService.setMarketEngine(this.engine);

    // Ensure transport treasury wallet is registered
    this.engine.getOrCreateTransportTreasuryWallet();

    console.log('[Market Engine] Initialized with PriceFormationService');
  }

  public reset(calculator?: ProductionCostCalculator): void {
    this.engine.reset();
    this.initialize(calculator);
  }
}

export const marketService = new MarketService();

