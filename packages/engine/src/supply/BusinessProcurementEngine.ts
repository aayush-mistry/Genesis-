import { Workplace, OrderStatus, PriceTier } from '@genesis/shared';
import { WorldEngine } from '../world/WorldEngine';
import { InventoryManager } from '../inventory/InventoryManager';
import { SupplyChainEngine } from './SupplyChainEngine';
import { MarketEngine } from '../market/MarketEngine';
import { SpatialQueryService } from '../spatial/SpatialQueryService';
import { EventScheduler } from '../events/EventScheduler';
import { TimeEngine } from '../time/TimeEngine';
import { TimeUtils } from '../utils/TimeUtils';

export interface ProcurementRequirement {
  buyerId: string;
  productId: string;
  requestedQuantity: number;
  currentStock: number;
  targetStock: number;
  reorderPoint: number;
  status: 'PENDING' | 'FULFILLED' | 'PARTIAL' | 'FAILED';
}

export interface SupplierRanking {
  supplierId: string;
  supplierType: string;
  availableQuantity: number;
  unitPrice: number;
  bulkPrice: number;
  transportCost: number;
  totalLandedCost: number;
  distance: number;
  quality: number;
  reliability: number;
  availabilityScore: number;
  priceScore: number;
  distanceScore: number;
  qualityScore: number;
  reliabilityScore: number;
  totalScore: number;
}

export class BusinessProcurementEngine {
  private procurementHistory: any[] = [];
  private pendingRequirements: ProcurementRequirement[] = [];
  
  // Weights (normalized to 1.0 total logically or can be scaled)
  public weights = {
    availabilityWeight: 0.3,
    priceWeight: 0.4,
    distanceWeight: 0.1,
    qualityWeight: 0.1,
    reliabilityWeight: 0.1
  };

  private bulkPricing: Record<string, PriceTier[]> = {
    'wheat': [
      { minimumQuantity: 0, unitPrice: 10 },
      { minimumQuantity: 100, unitPrice: 9 },
      { minimumQuantity: 500, unitPrice: 8 }
    ],
    'iron_ore': [
      { minimumQuantity: 0, unitPrice: 50 },
      { minimumQuantity: 100, unitPrice: 45 }
    ],
    'water': [
      { minimumQuantity: 0, unitPrice: 2 },
      { minimumQuantity: 1000, unitPrice: 1.5 }
    ]
  };

  constructor(
    private worldEngine: WorldEngine,
    private inventoryManager: InventoryManager,
    private supplyChainEngine: SupplyChainEngine,
    private spatialQueryService: SpatialQueryService,
    private eventScheduler: EventScheduler,
    private timeEngine: TimeEngine,
    private marketEngine?: MarketEngine // Optional if not fully integrated
  ) {}

  public initialize(): void {
    // Register Daily Procurement Event
    const time = this.timeEngine.getCurrentTime();
    this.eventScheduler.scheduleEvent({
      id: `daily-procurement`,
      name: 'Daily Business Procurement',
      description: 'Evaluates business inventories and places wholesale/producer orders.',
      scheduledTime: { ...time },
      createdTime: { ...time },
      priority: 'Normal',
      status: 'Scheduled',
      cancelFlag: false,
      retryCount: 0,
      sourceModule: 'BusinessProcurementEngine',
      targetModule: 'BusinessProcurementEngine',
      recurrence: { interval: 'Day' },
      handler: async () => {
        this.runProcurementCycle();
      }
    });
  }

  public runProcurementCycle(): void {
    const workplaces = this.worldEngine.workplaceRepository.findAll();
    const eligibleWorkplaces = workplaces.filter(w => ['SHOP', 'BUSINESS', 'WHOLESALE', 'RETAIL'].includes(w.type) && w.inventoryConfiguration);

    for (const buyer of eligibleWorkplaces) {
      if (!buyer.inventoryId) continue;
      
      const inventory = this.inventoryManager.getInventory(buyer.inventoryId);
      if (!inventory) continue;

      for (const [productId, config] of Object.entries(buyer.inventoryConfiguration!)) {
        const item = inventory.items[productId];
        const currentStock = item ? item.totalQuantity : 0;

        // Count pending incoming quantity
        const pendingIncoming = this.supplyChainEngine.getPendingIncomingQuantity(buyer.id, productId);
        const effectiveStock = currentStock + pendingIncoming;

        if (effectiveStock < config.reorderPoint) {
          const maxStorage = buyer.storageCapacity || 1000;
          let requestedQuantity = config.targetStock - currentStock; // Actual order is based on current physical stock to reach target eventually

          // Respect storage limit
          // Available space: maxStorage - (sum of all current items)
          let currentTotalVolume = 0;
          for (const invItem of Object.values(inventory.items)) {
            currentTotalVolume += invItem.totalQuantity; // Ignoring unit conversions for simplicity
          }
          const availableSpace = Math.max(0, maxStorage - currentTotalVolume);
          
          requestedQuantity = Math.min(requestedQuantity, availableSpace);

          if (requestedQuantity > 0) {
            this.processRequirement({
              buyerId: buyer.id,
              productId,
              requestedQuantity,
              currentStock,
              targetStock: config.targetStock,
              reorderPoint: config.reorderPoint,
              status: 'PENDING'
            }, buyer);
          }
        }
      }
    }
  }

  private processRequirement(req: ProcurementRequirement, buyer: Workplace): void {
    const suppliers = this.discoverSuppliers(buyer.regionId, req.productId);
    if (suppliers.length === 0) {
      req.status = 'FAILED';
      this.pendingRequirements.push(req);
      this.logProcurement(req, [], null, 'No suppliers found');
      return;
    }

    const rankings = this.rankSuppliers(buyer, suppliers, req.productId, req.requestedQuantity);
    if (rankings.length === 0) {
      req.status = 'FAILED';
      this.pendingRequirements.push(req);
      this.logProcurement(req, [], null, 'No valid rankings');
      return;
    }

    // Attempt Multi-supplier fulfillment
    let remainingQuantity = req.requestedQuantity;
    let fulfilled = false;

    for (const rank of rankings) {
      if (remainingQuantity <= 0) break;

      const orderQuantity = Math.min(remainingQuantity, rank.availableQuantity);
      if (orderQuantity <= 0) continue;

      const seller = this.worldEngine.workplaceRepository.findById(rank.supplierId);
      if (!seller) continue;

      // Verify Wallet
      if (buyer.wallet) {
        // Calculate cost for this specific portion
        const portionBulkPrice = this.calculateBulkPrice(req.productId, orderQuantity);
        const portionTransportCost = orderQuantity * rank.distance * 0.1; // Simple calculation
        const totalLandedCost = (portionBulkPrice * orderQuantity) + portionTransportCost;

        if (buyer.wallet.balance < totalLandedCost) {
          continue; // Cannot afford this supplier, try next
        }

        // Process through MarketEngine
        if (this.marketEngine) {
          const type = (buyer.type === 'RETAIL' || buyer.type === 'SHOP') ? 'RETAIL_PROCUREMENT' : 'WHOLESALE_PURCHASE';
          const tx = this.marketEngine.processTransaction(
            buyer.id, seller.id, req.productId, orderQuantity, 'kg', portionBulkPrice, 
            portionBulkPrice * orderQuantity, buyer.wallet.currency, type as any, buyer.regionId
          );
          if (!tx) continue;
          
          if (portionTransportCost > 0) {
            this.marketEngine.processTransaction(
              buyer.id, 'SYSTEM_TRANSPORT', null, null, null, null,
              portionTransportCost, buyer.wallet.currency, 'TRANSPORT_EXPENSE' as any, buyer.regionId
            );
          }
        } else {
          // Deduct from wallet temporarily (Fallback)
          buyer.wallet.balance -= totalLandedCost;
          buyer.wallet.totalExpenses += totalLandedCost;
          if (seller.wallet) {
            seller.wallet.balance += (portionBulkPrice * orderQuantity);
            seller.wallet.totalIncome += (portionBulkPrice * orderQuantity);
          }
        }
      }

      // Create Order
      const order = this.supplyChainEngine.createOrder(buyer.id, seller.id, req.productId, orderQuantity, 'kg');
      
      remainingQuantity -= orderQuantity;
      fulfilled = true;

      this.logProcurement(req, rankings, rank, `Ordered ${orderQuantity} from ${rank.supplierId}`, order.orderId);
    }

    if (remainingQuantity > 0) {
      req.requestedQuantity = remainingQuantity;
      req.status = 'PARTIAL';
      this.pendingRequirements.push(req);
    } else {
      req.status = 'FULFILLED';
    }
  }

  private discoverSuppliers(buyerRegionId: string, productId: string): Workplace[] {
    const allWorkplaces = this.worldEngine.workplaceRepository.findAll();
    const validTypes = ['WHOLESALE', 'FARM', 'MINE', 'FISHING_SITE', 'FOREST_SITE', 'FACTORY'];

    return allWorkplaces.filter(w => {
      if (!validTypes.includes(w.type)) return false;
      if (!w.inventoryId) return false;

      const inventory = this.inventoryManager.getInventory(w.inventoryId);
      if (!inventory || !inventory.items[productId]) return false;

      // Must have actual stock
      const available = inventory.items[productId].totalQuantity - (inventory.items[productId].reservedQuantity || 0);
      return available > 0;
    });
  }

  private calculateBulkPrice(productId: string, quantity: number): number {
    const tiers = this.bulkPricing[productId];
    if (!tiers) return 10; // Default fallback

    let applicablePrice = tiers[0].unitPrice;
    for (const tier of tiers) {
      if (quantity >= tier.minimumQuantity) {
        applicablePrice = tier.unitPrice;
      }
    }
    return applicablePrice;
  }

  private rankSuppliers(buyer: Workplace, suppliers: Workplace[], productId: string, requestedQuantity: number): SupplierRanking[] {
    const rankings: SupplierRanking[] = [];

    // Max values for normalization
    let maxPrice = 0.001;
    let maxDistance = 0.001;

    // Calculate raw values first
    for (const seller of suppliers) {
      const inventory = this.inventoryManager.getInventory(seller.inventoryId!)!;
      const available = inventory.items[productId].totalQuantity - (inventory.items[productId].reservedQuantity || 0);

      const bulkPrice = this.calculateBulkPrice(productId, Math.min(requestedQuantity, available));
      
      let distance = 10;
      try {
        const route = this.spatialQueryService.calculateRoute(seller.locationId, buyer.locationId);
        distance = route.distance;
      } catch (e) {
        // Fallback if coordinates missing
      }
      
      const transportCost = Math.min(requestedQuantity, available) * distance * 0.1; // flat rate
      const totalLandedCost = (bulkPrice * Math.min(requestedQuantity, available)) + transportCost;

      const unitPrice = totalLandedCost / Math.min(requestedQuantity, available); // effective unit price

      if (unitPrice > maxPrice) maxPrice = unitPrice;
      if (distance > maxDistance) maxDistance = distance;

      rankings.push({
        supplierId: seller.id,
        supplierType: seller.type,
        availableQuantity: available,
        unitPrice: this.bulkPricing[productId]?.[0]?.unitPrice || 10,
        bulkPrice,
        transportCost,
        totalLandedCost,
        distance,
        quality: 80, // Default for now
        reliability: 90, // Default for now
        
        // These will be calculated next
        availabilityScore: 0,
        priceScore: 0,
        distanceScore: 0,
        qualityScore: 0,
        reliabilityScore: 0,
        totalScore: 0
      });
    }

    // Apply scores
    for (const r of rankings) {
      r.availabilityScore = Math.min(100, (r.availableQuantity / requestedQuantity) * 100);
      
      const effectiveUnitPrice = r.totalLandedCost / Math.min(requestedQuantity, r.availableQuantity);
      r.priceScore = 100 - ((effectiveUnitPrice / maxPrice) * 100);
      r.distanceScore = 100 - ((r.distance / maxDistance) * 100);
      
      r.qualityScore = r.quality;
      r.reliabilityScore = r.reliability;

      // Wholesale preference bonus
      const wholesaleBonus = r.supplierType === 'WHOLESALE' ? 20 : 0;
      // Local region bonus
      const seller = this.worldEngine.workplaceRepository.findById(r.supplierId)!;
      const localBonus = seller.regionId === buyer.regionId ? 10 : 0;

      r.totalScore = 
        (r.availabilityScore * this.weights.availabilityWeight) +
        (r.priceScore * this.weights.priceWeight) +
        (r.distanceScore * this.weights.distanceWeight) +
        (r.qualityScore * this.weights.qualityWeight) +
        (r.reliabilityScore * this.weights.reliabilityWeight) +
        wholesaleBonus + localBonus;
    }

    // Sort descending by score
    return rankings.sort((a, b) => b.totalScore - a.totalScore);
  }

  private logProcurement(req: ProcurementRequirement, rankings: SupplierRanking[], selected: SupplierRanking | null, notes: string, orderId?: string) {
    this.procurementHistory.push({
      buyerId: req.buyerId,
      productId: req.productId,
      requestedQuantity: req.requestedQuantity,
      currentStock: req.currentStock,
      targetStock: req.targetStock,
      timestamp: TimeUtils.toSeconds(this.timeEngine.getCurrentTime()),
      selectedSupplierId: selected?.supplierId || null,
      notes,
      orderId,
      rankings: rankings.slice(0, 3) // Store top 3 for brevity
    });
  }

  public getPendingRequirements(): ProcurementRequirement[] {
    return this.pendingRequirements.filter(r => r.status === 'PENDING' || r.status === 'PARTIAL');
  }

  public getHistory(): any[] {
    return this.procurementHistory;
  }
}
