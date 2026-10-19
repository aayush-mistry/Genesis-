import { Order, OrderStatus, Shipment, ShipmentStatus } from '@genesis/shared';

export interface SupplyChainStorageAdapter {
  saveOrder(order: Order): Promise<void> | void;
  updateOrderStatus(
    orderId: string,
    status: OrderStatus,
    extra?: { shipmentId?: string; expectedDelivery?: number; transactionId?: string }
  ): Promise<void> | void;
  saveShipment(shipment: Shipment): Promise<void> | void;
  updateShipmentStatus(
    shipmentId: string,
    status: ShipmentStatus,
    extra?: { orderId?: string }
  ): Promise<void> | void;
}
