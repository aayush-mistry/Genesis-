import { InventoryManager, ProductionEngine, SupplyChainEngine } from '@genesis/engine';
import { worldService } from './world.service';
import { eventService } from './event.service';
import { timeService } from './time.service';
import { resourceService } from './resource.service';
import { spatialService } from './spatial.service';
import { Commodity, ProductCategory } from '@genesis/shared';

class SupplyService {
  public inventoryManager: InventoryManager;
  public productionEngine: ProductionEngine;
  public supplyChainEngine: SupplyChainEngine;

  constructor() {
    this.inventoryManager = new InventoryManager();
    this.productionEngine = new ProductionEngine(
      worldService.engine,
      eventService.scheduler,
      timeService.engine,
      this.inventoryManager,
      resourceService.engine
    );
    this.supplyChainEngine = new SupplyChainEngine(
      worldService.engine,
      eventService.scheduler,
      timeService.engine,
      this.inventoryManager,
      spatialService.engine.queryService
    );
  }

  public initialize() {
    // Register initial commodities
    const wheat: Commodity = {
      id: 'wheat',
      name: 'Wheat',
      category: ProductCategory.FOOD,
      unit: 'kg',
      basePrice: 10,
      isBiological: true
    };
    this.productionEngine.registerCommodity(wheat);

    this.productionEngine.registerProductionDefinition({
      productId: 'wheat',
      unit: 'kg',
      baseYieldPerArea: 100,
      workersRequiredPerUnitArea: 1
    });

    this.productionEngine.initialize();
  }
}

export const supplyService = new SupplyService();
