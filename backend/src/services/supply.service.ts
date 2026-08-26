import { InventoryManager, ProductionEngine, SupplyChainEngine, CommerceAutomation, BusinessProcurementEngine } from '@genesis/engine';
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
  public businessProcurementEngine: BusinessProcurementEngine;

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
    this.businessProcurementEngine = new BusinessProcurementEngine(
      worldService.engine,
      this.inventoryManager,
      this.supplyChainEngine,
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
      // marketEngine can be optionally passed if properly initialized
    );
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

    this.productionEngine.registerProductionDefinition({
      productId: 'wheat',
      workplaceType: 'FARM' as any, // using 'any' to avoid tight coupling if string is passed
      unit: 'kg',
      baseYieldPerArea: 100,
      workersRequiredPerUnitArea: 1,
      resourceRequirements: [
        { resourceId: 'WATER', amountPerOutputUnit: 20 },
      ]
    });

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
    this.commerceAutomation.initialize();
    this.businessProcurementEngine.initialize();

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
              'water': { reorderPoint: 100, targetStock: 500 }
            };
          }
        }
      }
    }

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
      handler: async () => {
        this.inventoryManager.removeExpiredItems(timeService.engine.getUptimeSeconds());
      }
    });
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
    this.businessProcurementEngine = new BusinessProcurementEngine(
      worldService.engine,
      this.inventoryManager,
      this.supplyChainEngine,
      spatialService.engine.queryService,
      eventService.scheduler,
      timeService.engine
    );
    this.initialize();
  }
}

export const supplyService = new SupplyService();
