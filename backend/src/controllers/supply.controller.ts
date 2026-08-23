import { FastifyRequest, FastifyReply } from 'fastify';
import { supplyService } from '../services/supply.service';
import { worldService } from '../services/world.service';

export const supplyController = {
  getInventory: async (request: FastifyRequest<{ Params: { businessId: string } }>, reply: FastifyReply) => {
    const { businessId } = request.params;
    const inventory = supplyService.inventoryManager.getInventoryByOwner(businessId);
    
    if (!inventory) {
      return reply.code(404).send({ message: 'Inventory not found for business' });
    }
    
    return reply.send(inventory);
  },

  getOrders: async (request: FastifyRequest<{ Params: { businessId: string } }>, reply: FastifyReply) => {
    const { businessId } = request.params;
    const orders = supplyService.supplyChainEngine.getOrdersForBusiness(businessId);
    return reply.send(orders);
  },

  getShipment: async (request: FastifyRequest<{ Params: { shipmentId: string } }>, reply: FastifyReply) => {
    const { shipmentId } = request.params;
    const shipment = supplyService.supplyChainEngine.getShipment(shipmentId);
    
    if (!shipment) {
      return reply.code(404).send({ message: 'Shipment not found' });
    }
    
    return reply.send(shipment);
  },

  getRegionProduction: async (request: FastifyRequest<{ Params: { regionId: string } }>, reply: FastifyReply) => {
    const { regionId } = request.params;
    const workplaces = worldService.engine.workplaceRepository.findAll().filter(w => w.regionId === regionId);
    
    const producers = workplaces.filter(w => ['FARM', 'MINE', 'FISHING_SITE', 'FOREST_SITE', 'FACTORY'].includes(w.type));
    const wholesale = workplaces.filter(w => w.type === 'WHOLESALE');
    const shipments = supplyService.supplyChainEngine.getAllActiveShipments();
    
    return reply.send({ producers, wholesale, shipments });
  },

  getRegionInventory: async (request: FastifyRequest<{ Params: { regionId: string } }>, reply: FastifyReply) => {
    const { regionId } = request.params;
    const workplaces = worldService.engine.workplaceRepository.findAll().filter(w => w.regionId === regionId);
    
    const inventories = [];
    for (const wp of workplaces) {
      const inv = supplyService.inventoryManager.getInventoryByOwner(wp.id);
      if (inv) {
        inventories.push({ workplace: wp.id, inventory: inv });
      }
    }
    
    return reply.send(inventories);
  }
};
