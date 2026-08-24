import { InventoryManager, ProductionEngine, SupplyChainEngine, CommerceAutomation } from '@genesis/engine';
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
  public commerceAutomation: CommerceAutomation;

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
    this.commerceAutomation = new CommerceAutomation(
      worldService.engine,
      this.supplyChainEngine,
      this.inventoryManager,
      spatialService.engine.queryService,
      eventService.scheduler,
      timeService.engine
    );
  }

  public initialize() {
    // Register initial commodities
    const wheat: Commodity = { id: 'wheat', name: 'Wheat', category: ProductCategory.FOOD, unit: 'kg', basePrice: 10, isBiological: true };
    const ironOre: Commodity = { id: 'iron_ore', name: 'Iron Ore', category: ProductCategory.RAW_MATERIAL, unit: 'kg', basePrice: 50, isBiological: false };
    const rawFish: Commodity = { id: 'raw_fish', name: 'Raw Fish', category: ProductCategory.FOOD, unit: 'kg', basePrice: 15, isBiological: true };
    const timber: Commodity = { id: 'timber', name: 'Timber', category: ProductCategory.RAW_MATERIAL, unit: 'kg', basePrice: 20, isBiological: true };
    
    this.productionEngine.registerCommodity(wheat);
    this.productionEngine.registerCommodity(ironOre);
    this.productionEngine.registerCommodity(rawFish);
    this.productionEngine.registerCommodity(timber);

    this.productionEngine.registerProductionDefinition({
      productId: 'wheat',
      workplaceType: 'FARM' as any, // using 'any' to avoid tight coupling if string is passed
      unit: 'kg',
      baseYieldPerArea: 100,
      workersRequiredPerUnitArea: 1
    });

    this.productionEngine.registerProductionDefinition({
      productId: 'iron_ore',
      workplaceType: 'MINE' as any,
      requiredResource: 'iron', // needs iron deposit
      unit: 'kg',
      baseYieldPerArea: 50,
      workersRequiredPerUnitArea: 2
    });

    this.productionEngine.registerProductionDefinition({
      productId: 'raw_fish',
      workplaceType: 'FISHING_SITE' as any,
      requiredResource: 'fish_stock', // needs fish
      unit: 'kg',
      baseYieldPerArea: 80,
      workersRequiredPerUnitArea: 1
    });

    this.productionEngine.registerProductionDefinition({
      productId: 'timber',
      workplaceType: 'FOREST_SITE' as any,
      requiredResource: 'forest', // needs forest
      unit: 'kg',
      baseYieldPerArea: 60,
      workersRequiredPerUnitArea: 1
    });

    this.productionEngine.initialize();
    this.commerceAutomation.initialize();

    // Initialize inventories for commercial and production workplaces
    const workplaces = worldService.engine.workplaceRepository.findAll();
    const typesNeedingInventory = ['WHOLESALE', 'SHOP', 'BUSINESS', 'FARM', 'MINE', 'FISHING_SITE', 'FOREST_SITE', 'FACTORY'];
    
    for (const wp of workplaces) {
      if (typesNeedingInventory.includes(wp.type)) {
        if (!wp.inventoryId) {
          wp.inventoryId = `inv-${wp.id}`;
          // Allocate storage capacity based on workplace capacity
          const storageCapacity = wp.capacity * 100;
          this.inventoryManager.createInventory(wp.inventoryId, wp.id, storageCapacity);
        }
      }
    }
  }

  public reset(): void {
    // Re-instantiate internal managers and engines
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
    this.commerceAutomation = new CommerceAutomation(
      worldService.engine,
      this.supplyChainEngine,
      this.inventoryManager,
      spatialService.engine.queryService,
      eventService.scheduler,
      timeService.engine
    );
    this.initialize();
  }
}

export const supplyService = new SupplyService();
