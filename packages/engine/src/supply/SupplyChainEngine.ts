import { Order, OrderStatus, Shipment, ShipmentStatus, TransportationMode } from '@genesis/shared';
import { SimulationEvent } from '../events/SimulationEvent';
import { WorldEngine } from '../world/WorldEngine';
import { EventScheduler } from '../events/EventScheduler';
import { TimeEngine } from '../time/TimeEngine';
import { InventoryManager } from '../inventory/InventoryManager';
import { SpatialQueryService } from '../spatial/SpatialQueryService';
import { TimeUtils } from '../utils/TimeUtils';
import { randomUUID } from 'crypto';
import { EventRegistry } from '../events/EventRegistry';
import { MarketEngine } from '../market/MarketEngine';
import { SupplyChainStorageAdapter } from './SupplyChainStorageAdapter';

export class SupplyChainEngine {
  private orders: Map<string, Order> = new Map();
  private shipments: Map<string, Shipment> = new Map();
  private marketEngine?: MarketEngine;
  private storageAdapter?: SupplyChainStorageAdapter;
  private pendingStorageOps: Promise<any>[] = [];

  // Speed for goods shipments. e.g. trucks
  public static readonly TRUCK_SPEED_UNITS_PER_HOUR = 80;

  constructor(
    private worldEngine: WorldEngine,
    private eventScheduler: EventScheduler,
    private timeEngine: TimeEngine,
    private inventoryManager: InventoryManager,
    private spatialQueryService: SpatialQueryService,
    storageAdapter?: SupplyChainStorageAdapter
  ) {
    this.storageAdapter = storageAdapter;
    EventRegistry.register('SupplyChainEngine.handleShipmentArrival', async (event) => {
      await this.handleShipmentArrival(event.metadata as { shipmentId: string, orderId: string });
    });
  }

  public setMarketEngine(engine: MarketEngine): void {
    this.marketEngine = engine;
  }

  public getMarketEngine(): MarketEngine | undefined {
    return this.marketEngine;
  }

  public setStorageAdapter(adapter: SupplyChainStorageAdapter): void {
    this.storageAdapter = adapter;
  }

  public getStorageAdapter(): SupplyChainStorageAdapter | undefined {
    return this.storageAdapter;
  }

  public async flushPersistence(): Promise<void> {
    const ops = [...this.pendingStorageOps];
    this.pendingStorageOps = [];
    await Promise.all(ops);
  }

  private trackStorageOp(op: Promise<any> | void): void {
    if (!op || typeof (op as any).then !== 'function') return;
    const p = (op as Promise<any>).catch(err => {
      console.error('[SupplyChainEngine] Storage adapter error:', err);
    });
    this.pendingStorageOps.push(p);
  }

  public clear(): void {
    this.orders.clear();
    this.shipments.clear();
    this.pendingStorageOps = [];
  }

  public loadOrders(orders: Order[]): void {
    for (const order of orders) {
      this.orders.set(order.orderId, order);
    }
  }

  public loadShipments(shipments: Shipment[]): void {
    for (const shipment of shipments) {
      this.shipments.set(shipment.shipmentId, shipment);
    }
  }

  public getAllOrders(): Order[] {
    return Array.from(this.orders.values());
  }

  public getAllShipments(): Shipment[] {
    return Array.from(this.shipments.values());
  }

  public getAllActiveOrders(): Order[] {
    return Array.from(this.orders.values()).filter(o =>
      [OrderStatus.CREATED, OrderStatus.PENDING, OrderStatus.CONFIRMED, OrderStatus.DISPATCHED].includes(o.status)
    );
  }

  public createOrder(
    buyerId: string,
    sellerId: string,
    productId: string,
    quantity: number,
    unit: string,
    orderId?: string,
    preReserved: boolean = false,
    transactionId?: string,
    unitPrice?: number,
    totalPrice?: number,
    currency?: string
  ): Order {
    if (orderId && this.orders.has(orderId)) {
      return this.orders.get(orderId)!;
    }

    const order: Order = {
      orderId: orderId || randomUUID(),
      buyerId,
      sellerId,
      productId,
      quantity,
      unit,
      unitPrice,
      totalPrice,
      currency,
      status: OrderStatus.CREATED,
      createdAt: TimeUtils.toSeconds(this.timeEngine.getCurrentTime()),
      transactionId
    };

    this.orders.set(order.orderId, order);
    
    // Attempt to auto-confirm if seller has enough inventory
    this.processOrder(order.orderId, preReserved);

    if (this.storageAdapter) {
      this.trackStorageOp(this.storageAdapter.saveOrder(order));
    }

    return order;
  }

  public getOrder(orderId: string): Order | undefined {
    return this.orders.get(orderId);
  }

  public getOrdersForBusiness(businessId: string): Order[] {
    return Array.from(this.orders.values()).filter(o => o.buyerId === businessId || o.sellerId === businessId);
  }

  public getAllActiveShipments(): Shipment[] {
    return Array.from(this.shipments.values()).filter(s => s.status === ShipmentStatus.IN_TRANSIT);
  }

  public getPendingIncomingQuantity(buyerId: string, productId: string): number {
    return Array.from(this.orders.values())
      .filter(o => 
        o.buyerId === buyerId && 
        o.productId === productId && 
        [OrderStatus.CREATED, OrderStatus.PENDING, OrderStatus.CONFIRMED, OrderStatus.DISPATCHED].includes(o.status)
      )
      .reduce((sum, o) => sum + o.quantity, 0);
  }

  public getShipment(shipmentId: string): Shipment | undefined {
    return this.shipments.get(shipmentId);
  }

  private processOrder(orderId: string, preReserved: boolean = false): void {
    const order = this.orders.get(orderId);
    if (!order || !(order.status === OrderStatus.CREATED || order.status === OrderStatus.PENDING)) return;

    const seller = this.worldEngine.workplaceRepository.findById(order.sellerId);
    if (!seller || !seller.inventoryId) {
      this.failOrderAndRefund(order, 'Seller workplace or inventory missing');
      return;
    }

    const reserved = preReserved || this.inventoryManager.reserveItemQuantity(seller.inventoryId, order.productId, order.quantity);
    if (reserved) {
      order.status = OrderStatus.CONFIRMED;
      this.dispatchShipmentForOrder(order);
    } else {
      // If seller is Wholesale, we pend the order and try to restock
      if (seller.type === 'WHOLESALE') {
        order.status = OrderStatus.PENDING;
        if (this.storageAdapter) {
          this.trackStorageOp(this.storageAdapter.updateOrderStatus(order.orderId, order.status));
        }
        this.eventScheduler.emitter.emit('WholesaleRestockNeeded', {
          orderId: order.orderId,
          wholesaleId: seller.id,
          productId: order.productId,
          quantity: order.quantity
        });
      } else {
        this.failOrderAndRefund(order, 'Insufficient seller inventory to fulfill order');
      }
    }
  }

  private dispatchShipmentForOrder(order: Order): void {
    const seller = this.worldEngine.workplaceRepository.findById(order.sellerId);
    const buyer = this.worldEngine.workplaceRepository.findById(order.buyerId);
    
    if (!seller || !buyer || !seller.inventoryId || !buyer.inventoryId) {
      this.failOrderAndRefund(order, 'Seller or buyer workplace/inventory missing at dispatch');
      return;
    }

    // Move goods from total/reserved in seller's inventory out into "transit"
    const consumed = this.inventoryManager.consumeReservedItem(seller.inventoryId, order.productId, order.quantity);
    if (!consumed) {
      this.failOrderAndRefund(order, 'Unable to consume reserved inventory at dispatch');
      return;
    }

    // Determine path and distance
    const { path, distance } = this.spatialQueryService.calculateRoute(seller.locationId, buyer.locationId);
    
    const estimatedTravelDurationHours = distance / SupplyChainEngine.TRUCK_SPEED_UNITS_PER_HOUR;
    const durationSeconds = estimatedTravelDurationHours * 3600;

    const currentTime = this.timeEngine.getCurrentTime();
    const currentSeconds = TimeUtils.toSeconds(currentTime);
    const arrivalSeconds = Math.round(currentSeconds + durationSeconds);
    const expectedArrivalSimulationTime = TimeUtils.fromSeconds(arrivalSeconds);

    const shipment: Shipment = {
      shipmentId: randomUUID(),
      originId: seller.id,
      destinationId: buyer.id,
      productId: order.productId,
      quantity: order.quantity,
      unit: order.unit,
      transportationMode: TransportationMode.ROAD,
      departureTime: currentSeconds,
      estimatedArrival: arrivalSeconds,
      status: ShipmentStatus.IN_TRANSIT,
      orderId: order.orderId
    };

    this.shipments.set(shipment.shipmentId, shipment);
    
    order.status = OrderStatus.DISPATCHED;
    order.shipmentId = shipment.shipmentId;
    order.expectedDelivery = arrivalSeconds;

    if (this.storageAdapter) {
      this.trackStorageOp(this.storageAdapter.saveShipment(shipment));
      this.trackStorageOp(this.storageAdapter.updateOrderStatus(order.orderId, order.status, {
        shipmentId: shipment.shipmentId,
        expectedDelivery: arrivalSeconds
      }));
    }

    // Schedule arrival event
    this.eventScheduler.scheduleEvent({
      id: `shipment-${shipment.shipmentId}`,
      name: 'Shipment Arrival',
      description: `Shipment ${shipment.shipmentId} arrives at ${buyer.id}`,
      priority: 'Normal',
      status: 'Scheduled',
      createdTime: TimeUtils.clone(currentTime),
      scheduledTime: expectedArrivalSimulationTime,
      sourceModule: 'SupplyChainEngine',
      targetModule: 'SupplyChainEngine',
      cancelFlag: false,
      retryCount: 0,
      metadata: {
        shipmentId: shipment.shipmentId,
        orderId: order.orderId
      },
      handlerName: 'SupplyChainEngine.handleShipmentArrival'
    });
  }

  public async handleShipmentArrival(metadata: { shipmentId: string, orderId: string }): Promise<void> {
    const { shipmentId, orderId } = metadata;
    const shipment = this.shipments.get(shipmentId);
    const order = this.orders.get(orderId);
    
    if (!shipment) {
      throw new Error(`Inconsistent supply chain state: Shipment ${shipmentId} not found at arrival`);
    }
    if (!order) {
      throw new Error(`Inconsistent supply chain state: Order ${orderId} missing for arriving shipment ${shipmentId}`);
    }
    if (shipment.status !== ShipmentStatus.IN_TRANSIT) {
      // Idempotency: already processed (delivered or failed)
      return;
    }

    const buyer = this.worldEngine.workplaceRepository.findById(shipment.destinationId);
    if (!buyer || !buyer.inventoryId) {
      this.failShipmentAndRecover(shipment, order, 'Destination workplace or inventory missing');
      await this.flushPersistence();
      return;
    }

    // Try to add to buyer's inventory
    const added = this.inventoryManager.addItemQuantity(buyer.inventoryId, shipment.productId, shipment.quantity, shipment.unit);
    
    if (added) {
      shipment.status = ShipmentStatus.DELIVERED;
      order.status = OrderStatus.DELIVERED;

      if (this.storageAdapter) {
        this.trackStorageOp(this.storageAdapter.updateShipmentStatus(shipment.shipmentId, shipment.status));
        this.trackStorageOp(this.storageAdapter.updateOrderStatus(order.orderId, order.status));
      }

      this.eventScheduler.emitter.emit('ShipmentDelivered', {
        shipmentId: shipment.shipmentId,
        orderId: order.orderId,
        destinationId: buyer.id,
        timestamp: this.timeEngine.getCurrentTime()
      });

      // After receiving goods, check if the buyer has any PENDING orders it needs to fulfill as a seller
      this.retryPendingOrdersForSeller(buyer.id);

    } else {
      this.failShipmentAndRecover(shipment, order, 'Buyer inventory at capacity or unable to accept delivery');
    }

    await this.flushPersistence();
  }

  private failOrderAndRefund(order: Order, reason: string): void {
    order.status = OrderStatus.FAILED;
    if (this.storageAdapter) {
      this.trackStorageOp(this.storageAdapter.updateOrderStatus(order.orderId, order.status));
    }

    const seller = this.worldEngine.workplaceRepository.findById(order.sellerId);
    if (seller && seller.inventoryId) {
      this.inventoryManager.releaseReservedItem(seller.inventoryId, order.productId, order.quantity);
    }
    if (order.transactionId && this.marketEngine) {
      this.marketEngine.reverseTransaction(order.transactionId, `${order.transactionId}-REV-DISPATCH`, reason);
      const transportTxId = order.transactionId.replace('B2B-PROC', 'TRANS');
      if (this.marketEngine.getTransaction(transportTxId)) {
        this.marketEngine.reverseTransaction(transportTxId, `${transportTxId}-REV-DISPATCH`, reason);
      }
    }
  }

  private failShipmentAndRecover(shipment: Shipment, order: Order, reason: string): void {
    shipment.status = ShipmentStatus.FAILED;
    order.status = OrderStatus.FAILED;

    if (this.storageAdapter) {
      this.trackStorageOp(this.storageAdapter.updateShipmentStatus(shipment.shipmentId, shipment.status));
      this.trackStorageOp(this.storageAdapter.updateOrderStatus(order.orderId, order.status));
    }

    // Return goods safely to seller warehouse so goods are not destroyed
    const seller = this.worldEngine.workplaceRepository.findById(shipment.originId);
    if (seller && seller.inventoryId) {
      const returned = this.inventoryManager.addItemQuantity(seller.inventoryId, shipment.productId, shipment.quantity, shipment.unit);
      if (!returned) {
        // Force restore into seller's inventory if capacity reached in transit
        const inv = this.inventoryManager.getInventory(seller.inventoryId);
        if (inv) {
          if (!inv.items[shipment.productId]) {
            inv.items[shipment.productId] = {
              productId: shipment.productId,
              totalQuantity: 0,
              reservedQuantity: 0,
              availableQuantity: 0,
              unit: shipment.unit,
              batches: []
            };
          }
          const item = inv.items[shipment.productId];
          if (!item.batches) {
            item.batches = [];
          }
          item.batches.push({
            quantity: shipment.quantity,
            acquiredAt: Date.now(),
            status: 'FRESH'
          });
          item.totalQuantity += shipment.quantity;
          inv.storageCapacity = Math.max(inv.storageCapacity, Object.values(inv.items).reduce((s, x) => s + x.totalQuantity, 0));
          item.availableQuantity = item.totalQuantity - item.reservedQuantity;
        }
      }
    } else {
      throw new Error(`Inconsistent supply chain state: Failed shipment ${shipment.shipmentId} cannot return goods because seller ${shipment.originId} or inventory is missing`);
    }

    // Compensate buyer and reverse payment
    if (order.transactionId && this.marketEngine) {
      this.marketEngine.reverseTransaction(order.transactionId, `${order.transactionId}-REV-ARRIVAL`, reason);
      const transportTxId = order.transactionId.replace('B2B-PROC', 'TRANS');
      if (this.marketEngine.getTransaction(transportTxId)) {
        this.marketEngine.reverseTransaction(transportTxId, `${transportTxId}-REV-ARRIVAL`, reason);
      }
    }
  }

  private retryPendingOrdersForSeller(sellerId: string): void {
    const pendingOrders = Array.from(this.orders.values())
      .filter(o => o.sellerId === sellerId && o.status === OrderStatus.PENDING)
      .sort((a, b) => a.createdAt - b.createdAt); // FIFO

    for (const po of pendingOrders) {
      this.processOrder(po.orderId);
    }
  }
}
