import { WorldEngine } from '../world/WorldEngine';
import { SupplyChainEngine } from './SupplyChainEngine';
import { InventoryManager } from '../inventory/InventoryManager';
import { SpatialQueryService } from '../spatial/SpatialQueryService';
import { EventScheduler } from '../events/EventScheduler';
import { TimeEngine } from '../time/TimeEngine';
import { SimulationEvent } from '../events/SimulationEvent';
import { Workplace, WorkplaceType } from '@genesis/shared';
import { randomUUID } from 'crypto';

interface RetailConfig {
  multiplier: number;
  products: string[];
}

export class CommerceAutomation {
  private isInitialized = false;

  // Simple hardcoded configurations for now
  private retailConfigs: Record<string, RetailConfig> = {
    GROCERY: { multiplier: 100, products: ['wheat', 'raw_fish'] },
    GENERAL: { multiplier: 50, products: ['wheat', 'raw_fish', 'timber'] },
    DEFAULT: { multiplier: 50, products: ['wheat', 'raw_fish'] }
  };

  private wholesaleProducts = ['wheat', 'raw_fish', 'timber', 'iron_ore'];

  constructor(
    private worldEngine: WorldEngine,
    private supplyChainEngine: SupplyChainEngine,
    private inventoryManager: InventoryManager,
    private spatialQueryService: SpatialQueryService,
    private eventScheduler: EventScheduler,
    private timeEngine: TimeEngine
  ) {}

  public initialize(): void {
    if (this.isInitialized) return;
    this.isInitialized = true;
    this.scheduleCommerceCycle();
    
    // Listen for wholesale restock needs
    this.eventScheduler.emitter.on('WholesaleRestockNeeded', (data: { orderId: string, wholesaleId: string, productId: string, quantity: number }) => {
      this.handleWholesaleRestockNeeded(data.wholesaleId, data.productId, data.quantity);
    });
  }

  private scheduleCommerceCycle(): void {
    const time = this.timeEngine.getCurrentTime();
    
    const event: SimulationEvent = {
      id: randomUUID(),
      name: 'Daily Commerce Cycle',
      description: 'Calculates restock needs for retail workplaces and places orders.',
      scheduledTime: { ...time }, 
      createdTime: { ...time },
      priority: 'Normal',
      status: 'Scheduled',
      cancelFlag: false,
      retryCount: 0,
      sourceModule: 'CommerceAutomation',
      targetModule: 'CommerceAutomation',
      recurrence: { interval: 'Day' }, // Daily recurring
      handler: async (e: SimulationEvent) => {
        this.runCommerceCycle();
      }
    };

    this.eventScheduler.scheduleEvent(event);
  }

  private runCommerceCycle(): void {
    const workplaces = this.worldEngine.workplaceRepository.findAll();
    const retailers = workplaces.filter(w => w.type === WorkplaceType.SHOP || w.type === WorkplaceType.BUSINESS);
    const wholesalers = workplaces.filter(w => w.type === WorkplaceType.WHOLESALE);

    // Only Process Retailers in the daily cycle
    for (const shop of retailers) {
      if (!shop.inventoryId) continue;
      
      // Determine profile
      let config = this.retailConfigs.DEFAULT;
      if (shop.metadata?.storeType && this.retailConfigs[shop.metadata.storeType as string]) {
        config = this.retailConfigs[shop.metadata.storeType as string];
      }
      
      this.processRetailRestock(shop, config, wholesalers);
    }
  }

  private processRetailRestock(buyer: Workplace, config: RetailConfig, wholesalers: Workplace[]): void {
    const inventory = this.inventoryManager.getInventory(buyer.inventoryId!);
    if (!inventory) return;

    const targetStock = buyer.capacity * config.multiplier;
    const reorderThreshold = targetStock * 0.3; // 30%

    for (const productId of config.products) {
      const currentStock = inventory.items[productId]?.totalQuantity || 0;
      const pendingStock = this.supplyChainEngine.getPendingIncomingQuantity(buyer.id, productId);
      const availableStock = currentStock + pendingStock;

      if (availableStock <= reorderThreshold) {
        const orderQuantity = targetStock - availableStock;
        if (orderQuantity > 0) {
          // Retail orders exclusively from Wholesale
          this.placeOrder(buyer, productId, orderQuantity, wholesalers);
        }
      }
    }
  }

  private handleWholesaleRestockNeeded(wholesaleId: string, productId: string, requestedQuantity: number): void {
    const wholesale = this.worldEngine.workplaceRepository.findById(wholesaleId);
    if (!wholesale || !wholesale.inventoryId) return;

    // Wholesale only orders what is requested to fulfill the pending retail order.
    // It does not aggressively maintain its own stock target unless instructed.
    const targetStock = requestedQuantity; 
    const inventory = this.inventoryManager.getInventory(wholesale.inventoryId);
    if (!inventory) return;

    const currentStock = inventory.items[productId]?.totalQuantity || 0;
    const pendingStock = this.supplyChainEngine.getPendingIncomingQuantity(wholesale.id, productId);
    const availableStock = currentStock + pendingStock;

    if (availableStock < requestedQuantity) {
      const orderQuantity = targetStock - availableStock;

      if (orderQuantity > 0) {
        // Find producers
        const workplaces = this.worldEngine.workplaceRepository.findAll();
        const producers = workplaces.filter(w => [WorkplaceType.FARM, WorkplaceType.MINE, WorkplaceType.FISHING_SITE, WorkplaceType.FOREST_SITE, WorkplaceType.FACTORY].includes(w.type));
        
        // Place order to producers
        this.placeOrder(wholesale, productId, orderQuantity, producers);
      }
    }
  }

  private placeOrder(buyer: Workplace, productId: string, quantity: number, suppliers: Workplace[]): void {
    // Filter to valid suppliers that actually have the product in stock
    const suppliersWithStock = suppliers.filter(s => {
      if (!s.inventoryId) return false;
      const inv = this.inventoryManager.getInventory(s.inventoryId);
      if (!inv) return false;
      const item = inv.items[productId];
      return item && (item.totalQuantity - item.reservedQuantity) >= quantity; // Require FULL fulfillment for now
    });

    let targetSuppliers = suppliersWithStock;

    // If no supplier has stock, and the buyer is Retail, fallback to any available Wholesale to act as broker
    if (targetSuppliers.length === 0 && buyer.type !== WorkplaceType.WHOLESALE) {
       targetSuppliers = suppliers.filter(s => s.type === WorkplaceType.WHOLESALE && !!s.inventoryId);
    }

    if (targetSuppliers.length === 0) return;

    // Sort by distance (and region preference)
    const sortedSuppliers = targetSuppliers.sort((a, b) => {
      if (a.regionId === buyer.regionId && b.regionId !== buyer.regionId) return -1;
      if (a.regionId !== buyer.regionId && b.regionId === buyer.regionId) return 1;
      
      const distA = this.spatialQueryService.calculateRoute(buyer.locationId, a.locationId).distance;
      const distB = this.spatialQueryService.calculateRoute(buyer.locationId, b.locationId).distance;
      return distA - distB;
    });

    // Try alternative suppliers (fallback) but do not split order
    for (const supplier of sortedSuppliers) {
      const isWholesaleBroker = supplier.type === WorkplaceType.WHOLESALE && targetSuppliers !== suppliersWithStock;
      
      const inv = this.inventoryManager.getInventory(supplier.inventoryId!)!;
      const item = inv.items[productId];
      const availableToSell = item ? (item.totalQuantity - item.reservedQuantity) : 0;
      
      if (availableToSell >= quantity || isWholesaleBroker) {
        this.supplyChainEngine.createOrder(buyer.id, supplier.id, productId, quantity, 'kg');
        return; // Success, break out (no split orders yet)
      }
    }
    
    // If we reach here, no single supplier could fulfill the whole quantity.
    // The requirement remains pending (next tick will retry).
  }
}
