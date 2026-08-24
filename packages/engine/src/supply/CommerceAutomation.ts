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
    let targetSuppliers = suppliers.filter(s => !!s.inventoryId && s.id !== buyer.id);

    if (targetSuppliers.length === 0) return;

    // Helper to check stock
    const getAvailableStock = (supplier: Workplace) => {
      const inv = this.inventoryManager.getInventory(supplier.inventoryId!)!;
      const item = inv.items[productId];
      return item ? (item.totalQuantity - item.reservedQuantity) : 0;
    };

    // Sort deterministic
    targetSuppliers.sort((a, b) => {
      const aStock = getAvailableStock(a) >= quantity;
      const bStock = getAvailableStock(b) >= quantity;
      
      const aSameRegion = a.regionId === buyer.regionId;
      const bSameRegion = b.regionId === buyer.regionId;

      const aWholesale = a.type === WorkplaceType.WHOLESALE;
      const bWholesale = b.type === WorkplaceType.WHOLESALE;

      // 1. Prefer Wholesale over Producer
      if (aWholesale && !bWholesale) return -1;
      if (!aWholesale && bWholesale) return 1;

      // 2. Prefer those with sufficient stock over those without
      if (aStock && !bStock) return -1;
      if (!aStock && bStock) return 1;

      // 3. Prefer same region
      if (aSameRegion && !bSameRegion) return -1;
      if (!aSameRegion && bSameRegion) return 1;

      // 4. Distance tie-breaker
      const distA = this.spatialQueryService.calculateRoute(buyer.locationId, a.locationId).distance;
      const distB = this.spatialQueryService.calculateRoute(buyer.locationId, b.locationId).distance;
      if (distA !== distB) return distA - distB;

      // 5. ID tie-breaker for strict determinism
      return a.id.localeCompare(b.id);
    });

    for (const supplier of targetSuppliers) {
      const hasStock = getAvailableStock(supplier) >= quantity;
      const isWholesaleBroker = supplier.type === WorkplaceType.WHOLESALE && buyer.type !== WorkplaceType.WHOLESALE;
      
      // If supplier has stock, or if it's a wholesale and can act as a broker
      if (hasStock || isWholesaleBroker) {
        this.supplyChainEngine.createOrder(buyer.id, supplier.id, productId, quantity, 'kg');
        return; // No split orders yet
      }
    }
  }
}
