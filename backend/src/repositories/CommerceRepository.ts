import { prisma } from './prisma';

export class CommerceRepository {
  async createOrder(data: any) {
    return prisma.order.create({ data });
  }

  async updateOrderStatus(orderId: string, status: string) {
    return prisma.order.update({
      where: { orderId },
      data: { status }
    });
  }

  async createShipment(data: any) {
    return prisma.shipment.create({ data });
  }

  async updateShipmentStatus(shipmentId: string, status: string) {
    return prisma.shipment.update({
      where: { shipmentId },
      data: { status }
    });
  }
}

export const commerceRepository = new CommerceRepository();
