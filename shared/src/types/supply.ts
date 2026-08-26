export enum OrderStatus {
  CREATED = 'CREATED',
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  DISPATCHED = 'DISPATCHED',
  DELIVERED = 'DELIVERED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED'
}

export interface PriceTier {
  minimumQuantity: number;
  unitPrice: number;
}

export interface Order {
  orderId: string;
  buyerId: string;
  sellerId: string;
  productId: string;
  quantity: number;
  unit: string;
  unitPrice?: number;
  totalPrice?: number;
  currency?: string;
  status: OrderStatus;
  createdAt: number; // Timestamp or SimulationTime representation
  expectedDelivery?: number;
  shipmentId?: string;
}

export enum ShipmentStatus {
  CREATED = 'CREATED',
  DISPATCHED = 'DISPATCHED',
  IN_TRANSIT = 'IN_TRANSIT',
  DELIVERED = 'DELIVERED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED'
}

export enum TransportationMode {
  ROAD = 'ROAD',
  RAIL = 'RAIL',
  SEA = 'SEA',
  AIR = 'AIR'
}

export interface Shipment {
  shipmentId: string;
  originId: string;
  destinationId: string;
  productId: string;
  quantity: number;
  unit: string;
  transportationMode: TransportationMode;
  routeId?: string;
  departureTime?: number;
  estimatedArrival?: number;
  status: ShipmentStatus;
}
