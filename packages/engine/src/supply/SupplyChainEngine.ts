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

export class SupplyChainEngine {
  private orders: Map<string, Order> = new Map();
  private shipments: Map<string, Shipment> = new Map();

  // Speed for goods shipments. e.g. trucks
  public static readonly TRUCK_SPEED_UNITS_PER_HOUR = 80;

  constructor(
    private worldEngine: WorldEngine,
    private eventScheduler: EventScheduler,
    private timeEngine: TimeEngine,
    private inventoryManager: InventoryManager,
    private spatialQueryService: SpatialQueryService
  ) {
    EventRegistry.register('SupplyChainEngine.handleShipmentArrival', async (event) => {
      this.handleShipmentArrival(event.metadata as { shipmentId: string, orderId: string });
    });
  }

  public createOrder(buyerId: string, sellerId: string, productId: string, quantity: number, unit: string): Order {
    const order: Order = {
      orderId: randomUUID(),
      buyerId,
      sellerId,
      productId,
      quantity,
      unit,
      status: OrderStatus.CREATED,
      createdAt: TimeUtils.toSeconds(this.timeEngine.getCurrentTime())
    };

    this.orders.set(order.orderId, order);
    
    // Attempt to auto-confirm if seller has enough inventory
    this.processOrder(order.orderId);

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

  private processOrder(orderId: string): void {
    const order = this.orders.get(orderId);
    if (!order || !(order.status === OrderStatus.CREATED || order.status === OrderStatus.PENDING)) return;

    const seller = this.worldEngine.workplaceRepository.findById(order.sellerId);
    if (!seller || !seller.inventoryId) {
      order.status = OrderStatus.FAILED;
      return;
    }

    const reserved = this.inventoryManager.reserveItemQuantity(seller.inventoryId, order.productId, order.quantity);
    if (reserved) {
      order.status = OrderStatus.CONFIRMED;
      this.dispatchShipmentForOrder(order);
    } else {
      // If seller is Wholesale, we pend the order and try to restock
      if (seller.type === 'WHOLESALE') {
        order.status = OrderStatus.PENDING;
        this.eventScheduler.emitter.emit('WholesaleRestockNeeded', {
          orderId: order.orderId,
          wholesaleId: seller.id,
          productId: order.productId,
          quantity: order.quantity
        });
      } else {
        order.status = OrderStatus.FAILED;
      }
    }
  }

  private dispatchShipmentForOrder(order: Order): void {
    const seller = this.worldEngine.workplaceRepository.findById(order.sellerId);
    const buyer = this.worldEngine.workplaceRepository.findById(order.buyerId);
    
    if (!seller || !buyer || !seller.inventoryId || !buyer.inventoryId) {
      order.status = OrderStatus.FAILED;
      return;
    }

    // Move goods from total/reserved in seller's inventory out into "transit"
    const consumed = this.inventoryManager.consumeReservedItem(seller.inventoryId, order.productId, order.quantity);
    if (!consumed) {
      order.status = OrderStatus.FAILED;
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
      status: ShipmentStatus.IN_TRANSIT
    };

    this.shipments.set(shipment.shipmentId, shipment);
    
    order.status = OrderStatus.DISPATCHED;
    order.shipmentId = shipment.shipmentId;
    order.expectedDelivery = arrivalSeconds;

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

  private handleShipmentArrival(metadata: { shipmentId: string, orderId: string }): void {
    const { shipmentId, orderId } = metadata;
    const shipment = this.shipments.get(shipmentId);
    const order = this.orders.get(orderId);
    
    if (!shipment || !order) return;

    const buyer = this.worldEngine.workplaceRepository.findById(shipment.destinationId);
    if (!buyer || !buyer.inventoryId) {
      shipment.status = ShipmentStatus.FAILED;
      order.status = OrderStatus.FAILED;
      return;
    }

    // Try to add to buyer's inventory
    const added = this.inventoryManager.addItemQuantity(buyer.inventoryId, shipment.productId, shipment.quantity, shipment.unit);
    
    if (added) {
      shipment.status = ShipmentStatus.DELIVERED;
      order.status = OrderStatus.DELIVERED;
      this.eventScheduler.emitter.emit('ShipmentDelivered', {
        shipmentId: shipment.shipmentId,
        orderId: order.orderId,
        destinationId: buyer.id,
        timestamp: this.timeEngine.getCurrentTime()
      });

      // After receiving goods, check if the buyer has any PENDING orders it needs to fulfill as a seller
      this.retryPendingOrdersForSeller(buyer.id);

    } else {
      shipment.status = ShipmentStatus.FAILED;
      order.status = OrderStatus.FAILED;
      // Goods are lost or need return mechanism (not implemented for now)
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
