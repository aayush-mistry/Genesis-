import { EventRegistry } from '../events/EventRegistry';
import { Workplace, OrderStatus, PriceTier } from '@genesis/shared';
import { WorldEngine } from '../world/WorldEngine';
import { InventoryManager } from '../inventory/InventoryManager';
import { SupplyChainEngine } from './SupplyChainEngine';
import { MarketEngine } from '../market/MarketEngine';
import { SpatialQueryService } from '../spatial/SpatialQueryService';
import { EventScheduler } from '../events/EventScheduler';
import { TimeEngine } from '../time/TimeEngine';
import { TimeUtils } from '../utils/TimeUtils';
import { DemandForecastingEngine } from '../consumption/DemandForecastingEngine';

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
    ],
    'raw_fish': [
      { minimumQuantity: 0, unitPrice: 15 },
      { minimumQuantity: 50, unitPrice: 13 },
      { minimumQuantity: 100, unitPrice: 11 }
    ],
    'timber': [
      { minimumQuantity: 0, unitPrice: 20 },
      { minimumQuantity: 50, unitPrice: 18 },
      { minimumQuantity: 100, unitPrice: 16 }
    ]
  };

  constructor(
    private worldEngine: WorldEngine,
    private inventoryManager: InventoryManager,
    private supplyChainEngine: SupplyChainEngine,
    private spatialQueryService: SpatialQueryService,
    private eventScheduler: EventScheduler,
    private timeEngine: TimeEngine,
    private marketEngine?: MarketEngine, // Optional if not fully integrated
    private demandForecastingEngine?: DemandForecastingEngine
  ) {
    EventRegistry.register('BusinessProcurementEngine.runProcurementCycle', async () => {
      this.runProcurementCycle();
    });
  }

  public setDemandForecaster(forecaster: DemandForecastingEngine): void {
    this.demandForecastingEngine = forecaster;
  }

  public getDemandForecaster(): DemandForecastingEngine | undefined {
    return this.demandForecastingEngine;
  }

  public setMarketEngine(engine: MarketEngine): void {
    this.marketEngine = engine;
  }

  public getMarketEngine(): MarketEngine | undefined {
    return this.marketEngine;
  }

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
      handlerName: 'BusinessProcurementEngine.runProcurementCycle'
    });
  }

  public runProcurementCycle(): void {
    const workplaces = this.worldEngine.workplaceRepository.findAll();
    const eligibleWorkplaces = workplaces.filter(w => ['SHOP', 'BUSINESS', 'WHOLESALE', 'RETAIL'].includes(w.type) && w.inventoryConfiguration);

    const currentTime = this.timeEngine.getCurrentTime();
    const currentSeconds = TimeUtils.toSeconds(currentTime);

    for (const buyer of eligibleWorkplaces) {
      if (!buyer.inventoryId) continue;
      
      const inventory = this.inventoryManager.getInventory(buyer.inventoryId);
      if (!inventory) continue;

      for (const [productId, config] of Object.entries(buyer.inventoryConfiguration!)) {
        const item = inventory.items[productId];
        const currentStock = item ? item.totalQuantity : 0;

        // Count pending incoming quantity from shipments and confirmed orders
        const pendingIncoming = this.supplyChainEngine.getPendingIncomingQuantity(buyer.id, productId);
        const effectiveStock = currentStock + pendingIncoming;

        let shouldProcure = false;
        let requestedQuantity = 0;

        // Check demand forecast as an additional signal if available
        if (this.demandForecastingEngine) {
          const forecast = this.demandForecastingEngine.forecast(
            productId,
            buyer.regionId,
            currentSeconds,
            { forecastHorizonDays: 1 }
          );

          if (forecast.dataSufficiency && forecast.forecastDemand !== null) {
            // Projected available stock over replenishment horizon
            const projectedAvailableSupply = effectiveStock - forecast.forecastDemand;

            // Trigger reorder if projected supply falls below reorder point or effective stock is low
            if (projectedAvailableSupply < config.reorderPoint || effectiveStock < config.reorderPoint) {
              shouldProcure = true;
              // Quantity needed to cover forecast demand and restore target stock
              requestedQuantity = Math.max(
                config.targetStock - currentStock,
                Math.ceil(config.targetStock + forecast.forecastDemand - effectiveStock)
              );
            }
          } else {
            // Insufficient history: fall back transparently to existing reorder rules
            if (effectiveStock < config.reorderPoint) {
              shouldProcure = true;
              requestedQuantity = config.targetStock - currentStock;
            }
          }
        } else {
          // Standard reorder point rule fallback
          if (effectiveStock < config.reorderPoint) {
            shouldProcure = true;
            requestedQuantity = config.targetStock - currentStock;
          }
        }

        if (shouldProcure && requestedQuantity > 0) {
          const maxStorage = buyer.storageCapacity || 1000;

          // Respect storage limit
          let currentTotalVolume = 0;
          for (const invItem of Object.values(inventory.items)) {
            currentTotalVolume += invItem.totalQuantity;
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

  public processRequirement(req: ProcurementRequirement, buyer: Workplace): void {
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

    const currentTime = this.timeEngine.getCurrentTime();
    const cycleKey = `${currentTime.year}-${currentTime.month}-${currentTime.day}`;

    // Attempt Multi-supplier fulfillment
    let remainingQuantity = req.requestedQuantity;
    let fulfilled = false;

    for (const rank of rankings) {
      if (remainingQuantity <= 0) break;

      const orderQuantity = Math.min(remainingQuantity, rank.availableQuantity);
      if (orderQuantity <= 0) continue;

      const seller = this.worldEngine.workplaceRepository.findById(rank.supplierId);
      if (!seller || !seller.inventoryId) continue;

      const txId = `B2B-PROC-${buyer.id}-${seller.id}-${req.productId}-${cycleKey}`;
      const orderId = `ORDER-${buyer.id}-${seller.id}-${req.productId}-${cycleKey}`;

      // Check for existing order or transaction in this cycle (Idempotency)
      const existingOrder = this.supplyChainEngine.getOrder(orderId);
      if (existingOrder) {
        if ([OrderStatus.CREATED, OrderStatus.CONFIRMED, OrderStatus.DISPATCHED, OrderStatus.DELIVERED].includes(existingOrder.status)) {
          remainingQuantity -= existingOrder.quantity;
          fulfilled = true;
          this.logProcurement(req, rankings, rank, `Reconciled existing order ${orderId} (${existingOrder.status})`, orderId);
          continue;
        }
        // If order was FAILED, do not repeat in the same simulation cycle
        continue;
      }

      if (this.marketEngine) {
        const existingTx = this.marketEngine.getTransaction(txId);
        if (existingTx && !this.marketEngine.isTransactionReversed(txId)) {
          remainingQuantity -= (existingTx.quantity || orderQuantity);
          fulfilled = true;
          continue;
        }
      }

      // 1. Verify and reserve the required producer inventory before finalizing payment
      const reserved = this.inventoryManager.reserveItemQuantity(seller.inventoryId, req.productId, orderQuantity);
      if (!reserved) {
        continue;
      }

      const portionBulkPrice = this.calculateBulkPrice(req.productId, orderQuantity, seller.regionId);
      const portionTransportCost = orderQuantity * rank.distance * 0.1;
      const totalPurchasePrice = portionBulkPrice * orderQuantity;
      const totalLandedCost = totalPurchasePrice + portionTransportCost;

      // Check wallet balance
      const buyerWallet = buyer.wallet || (this.marketEngine ? this.marketEngine.getWallet(buyer.id) : undefined);
      if (buyerWallet && buyerWallet.balance < totalLandedCost) {
        // Insufficient funds: release reservation immediately
        this.inventoryManager.releaseReservedItem(seller.inventoryId, req.productId, orderQuantity);
        continue;
      }

      // 2. Process payment
      let paymentSuccess = false;
      if (this.marketEngine) {
        const type = (buyer.type === 'RETAIL' || buyer.type === 'SHOP') ? 'RETAIL_PROCUREMENT' : 'WHOLESALE_PURCHASE';
        const tx = this.marketEngine.processTransaction(
          buyer.id, seller.id, req.productId, orderQuantity, 'kg', portionBulkPrice, 
          totalPurchasePrice, buyerWallet?.currency || 'GEN', type as any, buyer.regionId, txId
        );
        if (tx) {
          paymentSuccess = true;
          if (portionTransportCost > 0) {
            const transportTxId = `TRANS-${buyer.id}-${seller.id}-${req.productId}-${cycleKey}`;
            this.marketEngine.processTransaction(
              buyer.id, 'SYSTEM_TRANSPORT', null, null, null, null,
              portionTransportCost, buyerWallet?.currency || 'GEN', 'TRANSPORT_EXPENSE' as any, buyer.regionId, transportTxId
            );
          }
        }
      } else if (buyerWallet) {
        buyerWallet.balance -= totalLandedCost;
        buyerWallet.totalExpenses += totalLandedCost;
        if (seller.wallet) {
          seller.wallet.balance += totalPurchasePrice;
          seller.wallet.totalIncome += totalPurchasePrice;
        }
        paymentSuccess = true;
      }

      if (!paymentSuccess) {
        // Payment failed: release reservation and leave balances unchanged
        this.inventoryManager.releaseReservedItem(seller.inventoryId, req.productId, orderQuantity);
        continue;
      }

      // 3. Create Order with preReserved = true and deterministic orderId & txId
      const order = this.supplyChainEngine.createOrder(
        buyer.id, seller.id, req.productId, orderQuantity, 'kg', orderId, true, txId
      );

      // If order creation or dispatch failed, compensate
      if (order.status === OrderStatus.FAILED) {
        this.inventoryManager.releaseReservedItem(seller.inventoryId, req.productId, orderQuantity);
        if (this.marketEngine) {
          this.marketEngine.reverseTransaction(txId, `${txId}-REV-CREATION`, 'Order creation or dispatch failed');
        }
        continue;
      }

      remainingQuantity -= orderQuantity;
      fulfilled = true;

      this.logProcurement(req, rankings, rank, `Ordered ${orderQuantity} from ${rank.supplierId}`, order.orderId);
    }

    if (remainingQuantity > 0) {
      req.requestedQuantity = remainingQuantity;
      req.status = fulfilled ? 'PARTIAL' : 'FAILED';
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

  public calculateBulkPrice(productId: string, quantity: number, regionId: string = 'DEFAULT'): number {
    if (this.marketEngine) {
      const priceService = this.marketEngine.getPriceFormationService();
      if (priceService) {
        const regionalAdj = this.marketEngine.getRegionalAdjustment(regionId, productId);
        const regionalMultiplier = regionalAdj ? regionalAdj.adjustmentMultiplier : 1.0;
        const regionalOffset = regionalAdj ? regionalAdj.adjustmentOffset : 0.0;
        const breakdown = priceService.calculatePrice(
          productId,
          regionId,
          regionalMultiplier,
          regionalOffset,
          quantity,
          this.bulkPricing[productId]
        );
        return breakdown.wholesaleUnitPrice;
      }
    }

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

      const bulkPrice = this.calculateBulkPrice(productId, Math.min(requestedQuantity, available), seller.regionId);
      
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

      const quality = inventory.items[productId].quality ?? 50;

      rankings.push({
        supplierId: seller.id,
        supplierType: seller.type,
        availableQuantity: available,
        unitPrice: this.bulkPricing[productId]?.[0]?.unitPrice || 10,
        bulkPrice,
        transportCost,
        totalLandedCost,
        distance,
        quality,
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

  public clear(): void {
    this.procurementHistory = [];
    this.pendingRequirements = [];
  }

  public reset(): void {
    this.clear();
  }
}
