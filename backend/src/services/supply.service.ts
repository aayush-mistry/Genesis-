import { InventoryManager, ProductionEngine, SupplyChainEngine, CommerceAutomation, BusinessProcurementEngine, EventRegistry, TimeUtils, WHEAT_CROP_DEFINITION, MarketEngine } from '@genesis/engine';
import { worldService } from './world.service';
import { eventService } from './event.service';
import { timeService } from './time.service';
import { resourceService } from './resource.service';
import { environmentService } from './environment.service';
import { spatialService } from './spatial.service';
import { Commodity, ProductCategory } from '@genesis/shared';

class SupplyService {
  public inventoryManager: InventoryManager;
  public productionEngine: ProductionEngine;
  public supplyChainEngine: SupplyChainEngine;
  public commerceAutomation: CommerceAutomation;
  public businessProcurementEngine: BusinessProcurementEngine;
  private marketEngine?: MarketEngine;

  public setMarketEngine(engine: MarketEngine): void {
    this.marketEngine = engine;
    if (this.businessProcurementEngine) {
      this.businessProcurementEngine.setMarketEngine(engine);
    }
    if (this.supplyChainEngine) {
      this.supplyChainEngine.setMarketEngine(engine);
    }
  }

  public getMarketEngine(): MarketEngine | undefined {
    return this.marketEngine;
  }

  constructor() {
    this.inventoryManager = new InventoryManager();
    this.productionEngine = new ProductionEngine(
      worldService.engine,
      eventService.scheduler,
      timeService.engine,
      this.inventoryManager,
      resourceService.engine,
      environmentService.engine
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
    this.businessProcurementEngine = new BusinessProcurementEngine(
      worldService.engine,
      this.inventoryManager,
      this.supplyChainEngine,
      spatialService.engine.queryService,
      eventService.scheduler,
      timeService.engine,
      this.marketEngine
    );
    
    EventRegistry.register('SupplyService.removeExpiredItems', async () => {
      this.inventoryManager.removeExpiredItems(TimeUtils.toSeconds(timeService.engine.getCurrentTime()));
    });
  }

  public initialize() {
    // Register initial commodities
    const wheat: Commodity = { id: 'wheat', name: 'Wheat', category: ProductCategory.FOOD, unit: 'kg', basePrice: 10, isBiological: true, consumable: { restorationNeed: 'HUNGER', restorationValue: 20 }, perishable: { shelfLifeHours: 72 } };
    const ironOre: Commodity = { id: 'iron_ore', name: 'Iron Ore', category: ProductCategory.RAW_MATERIAL, unit: 'kg', basePrice: 50, isBiological: false };
    const rawFish: Commodity = { id: 'raw_fish', name: 'Raw Fish', category: ProductCategory.FOOD, unit: 'kg', basePrice: 15, isBiological: true, consumable: { restorationNeed: 'HUNGER', restorationValue: 30 }, perishable: { shelfLifeHours: 24 } };
    const water: Commodity = { id: 'water', name: 'Water', category: ProductCategory.FOOD, unit: 'L', basePrice: 2, isBiological: true, consumable: { restorationNeed: 'THIRST', restorationValue: 25 }, perishable: { shelfLifeHours: 168 } };
    const timber: Commodity = { id: 'timber', name: 'Timber', category: ProductCategory.RAW_MATERIAL, unit: 'kg', basePrice: 20, isBiological: true };
    
    this.productionEngine.registerCommodity(wheat);
    this.productionEngine.registerCommodity(ironOre);
    this.productionEngine.registerCommodity(rawFish);
    this.productionEngine.registerCommodity(water);
    this.productionEngine.registerCommodity(timber);

    import('./consumption.service').then(({ consumptionService }) => {
      this.businessProcurementEngine.setDemandForecaster(consumptionService.forecastingEngine);
    });

    if (!this.marketEngine) {
      import('./market.service').then(({ marketService }) => {
        if (marketService?.engine) {
          this.setMarketEngine(marketService.engine);
        }
      });
    } else {
      this.businessProcurementEngine.setMarketEngine(this.marketEngine);
    }

    this.productionEngine.registerCropDefinition(WHEAT_CROP_DEFINITION);

    this.productionEngine.registerProductionDefinition({
      productId: 'iron_ore',
      workplaceType: 'MINE' as any,
      unit: 'kg',
      baseYieldPerArea: 50,
      workersRequiredPerUnitArea: 2,
      resourceRequirements: [
        { resourceId: 'IRON', amountPerOutputUnit: 1 },
      ]
    });

    this.productionEngine.registerProductionDefinition({
      productId: 'raw_fish',
      workplaceType: 'FISHING_SITE' as any,
      unit: 'kg',
      baseYieldPerArea: 80,
      workersRequiredPerUnitArea: 1,
      resourceRequirements: [
        { resourceId: 'FISH', amountPerOutputUnit: 1 },
      ]
    });

    this.productionEngine.registerProductionDefinition({
      productId: 'timber',
      workplaceType: 'FOREST_SITE' as any,
      unit: 'kg',
      baseYieldPerArea: 60,
      workersRequiredPerUnitArea: 1,
      resourceRequirements: [
        { resourceId: 'FORESTS', amountPerOutputUnit: 1 },
      ]
    });

    this.productionEngine.initialize();
    // Disable legacy CommerceAutomation to prevent unpaid parallel inventory transfers (GAP-1)
    this.commerceAutomation.setEnabled(false);
    this.businessProcurementEngine.initialize();

    // Note: Inventory and wallet initialization for workplaces has been moved to setupWorkplaceInventories()
    // which should be called after workplaces are generated.

    // Schedule daily expiry check
    const time = timeService.engine.getCurrentTime();
    eventService.scheduler.scheduleEvent({
      id: `expiry-check-${Date.now()}`,
      name: 'Daily Expiry Check',
      description: 'Removes expired inventory items.',
      scheduledTime: { ...time },
      createdTime: { ...time },
      priority: 'Normal',
      status: 'Scheduled',
      cancelFlag: false,
      retryCount: 0,
      sourceModule: 'SupplyService',
      targetModule: 'InventoryManager',
      recurrence: { interval: 'Day' },
      handlerName: 'SupplyService.removeExpiredItems'
    });
  }

  public setupWorkplaceInventories(): void {
    // Initialize inventories for commercial and production workplaces
    const workplaces = worldService.engine.workplaceRepository.findAll();
    const typesNeedingInventory = ['WHOLESALE', 'SHOP', 'BUSINESS', 'FARM', 'MINE', 'FISHING_SITE', 'FOREST_SITE', 'FACTORY'];
    
    for (const wp of workplaces) {
      if (typesNeedingInventory.includes(wp.type)) {
        if (!wp.inventoryId) {
          wp.inventoryId = `inv-${wp.id}`;
          // Allocate storage capacity based on workplace capacity
          const storageCapacity = wp.capacity * 100;
          wp.storageCapacity = storageCapacity;
          this.inventoryManager.createInventory(wp.inventoryId, wp.id, storageCapacity);
        } else if (!this.inventoryManager.getInventory(wp.inventoryId)) {
          const storageCapacity = wp.capacity * 100;
          wp.storageCapacity = storageCapacity;
          this.inventoryManager.createInventory(wp.inventoryId, wp.id, storageCapacity);
        }
        
        // Initialize Wallets
        if (!wp.wallet) {
          wp.wallet = {
            id: `wallet-${wp.id}`,
            ownerId: wp.id,
            balance: 100000, // Initialize with 100k for testing bulk purchases
            currency: 'GEN',
            totalIncome: 0,
            totalExpenses: 0
          };
        }
        
        // Initialize Inventory Configuration for Business Procurement
        if (['SHOP', 'BUSINESS', 'WHOLESALE'].includes(wp.type)) {
          if (!wp.inventoryConfiguration) {
            wp.inventoryConfiguration = {
              'wheat': { reorderPoint: 50, targetStock: 200 },
              'iron_ore': { reorderPoint: 20, targetStock: 100 },
              'water': { reorderPoint: 100, targetStock: 500 },
              'raw_fish': { reorderPoint: 30, targetStock: 150 },
              'timber': { reorderPoint: 20, targetStock: 100 }
            };
          } else {
            if (!wp.inventoryConfiguration['raw_fish']) {
              wp.inventoryConfiguration['raw_fish'] = { reorderPoint: 30, targetStock: 150 };
            }
            if (!wp.inventoryConfiguration['timber']) {
              wp.inventoryConfiguration['timber'] = { reorderPoint: 20, targetStock: 100 };
            }
          }
        }

        // Persist updates to the workplace
        worldService.engine.workplaceRepository.update(wp);
      }
    }
  }

  public reset(marketEngine?: MarketEngine): void {
    if (marketEngine) {
      this.marketEngine = marketEngine;
    }

    // Re-instantiate internal managers and engines
    if (!this.inventoryManager) {
      this.inventoryManager = new InventoryManager();
    } else {
      (this.inventoryManager as any).inventories?.clear();
    }
    
    this.productionEngine = new ProductionEngine(
      worldService.engine,
      eventService.scheduler,
      timeService.engine,
      this.inventoryManager,
      resourceService.engine,
      environmentService.engine
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
    this.commerceAutomation.setEnabled(false);
    this.businessProcurementEngine = new BusinessProcurementEngine(
      worldService.engine,
      this.inventoryManager,
      this.supplyChainEngine,
      spatialService.engine.queryService,
      eventService.scheduler,
      timeService.engine,
      this.marketEngine
    );
    if (this.marketEngine) {
      this.businessProcurementEngine.setMarketEngine(this.marketEngine);
      this.supplyChainEngine.setMarketEngine(this.marketEngine);
    }
    this.initialize();
  }
}

export const supplyService = new SupplyService();
