import { prisma } from './prisma';
import { Order, OrderStatus, Shipment, ShipmentStatus, TransportationMode } from '@genesis/shared';
import { SupplyChainStorageAdapter } from '@genesis/engine';

export class CommerceRepository implements SupplyChainStorageAdapter {
  /**
   * Save or update an order in the database (Upsert)
   */
  async saveOrder(order: Order): Promise<any> {
    const data = {
      orderId: order.orderId,
      buyerId: order.buyerId,
      sellerId: order.sellerId,
      productId: order.productId,
      quantity: order.quantity,
      unit: order.unit,
      unitPrice: order.unitPrice ?? null,
      totalPrice: order.totalPrice ?? null,
      currency: order.currency ?? null,
      status: order.status,
      createdAtSim: order.createdAt,
      expectedDelivery: order.expectedDelivery ?? null,
      shipmentId: order.shipmentId ?? null,
      transactionId: order.transactionId ?? null
    };

    return prisma.order.upsert({
      where: { orderId: order.orderId },
      update: data,
      create: data
    });
  }

  async upsertOrder(order: Order): Promise<any> {
    return this.saveOrder(order);
  }

  /**
   * Legacy createOrder for existing tests/callers
   */
  async createOrder(data: any): Promise<any> {
    return prisma.order.create({ data });
  }

  /**
   * Updates an order's status and optional delivery/shipment metadata
   */
  async updateOrderStatus(
    orderId: string,
    status: OrderStatus | string,
    extra?: { shipmentId?: string; expectedDelivery?: number; transactionId?: string }
  ): Promise<any> {
    const data: any = { status };
    if (extra?.shipmentId !== undefined) data.shipmentId = extra.shipmentId;
    if (extra?.expectedDelivery !== undefined) data.expectedDelivery = extra.expectedDelivery;
    if (extra?.transactionId !== undefined) data.transactionId = extra.transactionId;

    return prisma.order.updateMany({
      where: { orderId },
      data
    });
  }

  /**
   * Save or update a shipment in the database (Upsert)
   */
  async saveShipment(shipment: Shipment): Promise<any> {
    const data = {
      shipmentId: shipment.shipmentId,
      originId: shipment.originId,
      destinationId: shipment.destinationId,
      productId: shipment.productId,
      quantity: shipment.quantity,
      unit: shipment.unit,
      transportationMode: shipment.transportationMode,
      routeId: shipment.routeId ?? null,
      departureTime: shipment.departureTime ?? null,
      estimatedArrival: shipment.estimatedArrival ?? null,
      status: shipment.status,
      orderId: shipment.orderId ?? null
    };

    return prisma.shipment.upsert({
      where: { shipmentId: shipment.shipmentId },
      update: data,
      create: data
    });
  }

  async upsertShipment(shipment: Shipment): Promise<any> {
    return this.saveShipment(shipment);
  }

  /**
   * Legacy createShipment for existing tests/callers
   */
  async createShipment(data: any): Promise<any> {
    return prisma.shipment.create({ data });
  }

  /**
   * Updates a shipment's status and optional metadata
   */
  async updateShipmentStatus(
    shipmentId: string,
    status: ShipmentStatus | string,
    extra?: { orderId?: string }
  ): Promise<any> {
    const data: any = { status };
    if (extra?.orderId !== undefined) data.orderId = extra.orderId;

    return prisma.shipment.updateMany({
      where: { shipmentId },
      data
    });
  }

  async getOrder(orderId: string): Promise<Order | null> {
    const record = await prisma.order.findUnique({ where: { orderId } });
    if (!record) return null;
    return {
      orderId: record.orderId,
      buyerId: record.buyerId,
      sellerId: record.sellerId,
      productId: record.productId,
      quantity: record.quantity,
      unit: record.unit,
      unitPrice: record.unitPrice ?? undefined,
      totalPrice: record.totalPrice ?? undefined,
      currency: record.currency ?? undefined,
      status: record.status as OrderStatus,
      createdAt: record.createdAtSim,
      expectedDelivery: record.expectedDelivery ?? undefined,
      shipmentId: record.shipmentId ?? undefined,
      transactionId: record.transactionId ?? undefined
    };
  }

  async getShipment(shipmentId: string): Promise<Shipment | null> {
    const record = await prisma.shipment.findUnique({ where: { shipmentId } });
    if (!record) return null;
    return {
      shipmentId: record.shipmentId,
      originId: record.originId,
      destinationId: record.destinationId,
      productId: record.productId,
      quantity: record.quantity,
      unit: record.unit,
      transportationMode: record.transportationMode as TransportationMode,
      routeId: record.routeId ?? undefined,
      departureTime: record.departureTime ?? undefined,
      estimatedArrival: record.estimatedArrival ?? undefined,
      status: record.status as ShipmentStatus,
      orderId: record.orderId ?? undefined
    };
  }

  async listActiveOrders(): Promise<Order[]> {
    const records = await prisma.order.findMany({
      where: {
        status: {
          in: ['CREATED', 'PENDING', 'CONFIRMED', 'DISPATCHED']
        }
      }
    });
    return records.map(r => ({
      orderId: r.orderId,
      buyerId: r.buyerId,
      sellerId: r.sellerId,
      productId: r.productId,
      quantity: r.quantity,
      unit: r.unit,
      unitPrice: r.unitPrice ?? undefined,
      totalPrice: r.totalPrice ?? undefined,
      currency: r.currency ?? undefined,
      status: r.status as OrderStatus,
      createdAt: r.createdAtSim,
      expectedDelivery: r.expectedDelivery ?? undefined,
      shipmentId: r.shipmentId ?? undefined,
      transactionId: r.transactionId ?? undefined
    }));
  }

  async listActiveShipments(): Promise<Shipment[]> {
    const records = await prisma.shipment.findMany({
      where: {
        status: {
          in: ['CREATED', 'DISPATCHED', 'IN_TRANSIT']
        }
      }
    });
    return records.map(r => ({
      shipmentId: r.shipmentId,
      originId: r.originId,
      destinationId: r.destinationId,
      productId: r.productId,
      quantity: r.quantity,
      unit: r.unit,
      transportationMode: r.transportationMode as TransportationMode,
      routeId: r.routeId ?? undefined,
      departureTime: r.departureTime ?? undefined,
      estimatedArrival: r.estimatedArrival ?? undefined,
      status: r.status as ShipmentStatus,
      orderId: r.orderId ?? undefined
    }));
  }

  async listAllOrders(): Promise<Order[]> {
    const records = await prisma.order.findMany({
      orderBy: { createdAtSim: 'asc' }
    });
    return records.map(r => ({
      orderId: r.orderId,
      buyerId: r.buyerId,
      sellerId: r.sellerId,
      productId: r.productId,
      quantity: r.quantity,
      unit: r.unit,
      unitPrice: r.unitPrice ?? undefined,
      totalPrice: r.totalPrice ?? undefined,
      currency: r.currency ?? undefined,
      status: r.status as OrderStatus,
      createdAt: r.createdAtSim,
      expectedDelivery: r.expectedDelivery ?? undefined,
      shipmentId: r.shipmentId ?? undefined,
      transactionId: r.transactionId ?? undefined
    }));
  }

  async listAllShipments(): Promise<Shipment[]> {
    const records = await prisma.shipment.findMany();
    return records.map(r => ({
      shipmentId: r.shipmentId,
      originId: r.originId,
      destinationId: r.destinationId,
      productId: r.productId,
      quantity: r.quantity,
      unit: r.unit,
      transportationMode: r.transportationMode as TransportationMode,
      routeId: r.routeId ?? undefined,
      departureTime: r.departureTime ?? undefined,
      estimatedArrival: r.estimatedArrival ?? undefined,
      status: r.status as ShipmentStatus,
      orderId: r.orderId ?? undefined
    }));
  }
}

export const commerceRepository = new CommerceRepository();
