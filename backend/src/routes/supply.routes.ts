import { FastifyInstance } from 'fastify';
import { supplyController } from '../controllers/supply.controller';

export async function supplyRoutes(fastify: FastifyInstance) {
  fastify.get('/businesses/:businessId/inventory', supplyController.getInventory);
  fastify.get('/businesses/:businessId/orders', supplyController.getOrders);
  fastify.get('/shipments/:shipmentId', supplyController.getShipment);
  fastify.get('/regions/:regionId/production', supplyController.getRegionProduction);
  fastify.get('/regions/:regionId/inventory', supplyController.getRegionInventory);
}
