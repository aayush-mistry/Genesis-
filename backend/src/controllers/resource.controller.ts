import { FastifyRequest, FastifyReply } from 'fastify';
import { resourceService } from '../services/resource.service';

export const ResourceController = {
  getAllResources: async (_request: FastifyRequest, _reply: FastifyReply) => {
    return resourceService.engine.resourceManager.getAllResources();
  },

  getResourcesByRegion: async (request: FastifyRequest, _reply: FastifyReply) => {
    const { regionId } = request.params as { regionId: string };
    return resourceService.engine.resourceManager.getResourcesByRegion(regionId);
  },

  getResourceById: async (request: FastifyRequest, reply: FastifyReply) => {
    const { regionId, resourceId } = request.params as { regionId: string, resourceId: string };
    const resource = resourceService.engine.resourceManager.getResourceById(regionId, resourceId);
    if (!resource) return reply.status(404).send({ error: 'Resource not found' });
    return resource;
  },

  getStatistics: async (_request: FastifyRequest, _reply: FastifyReply) => {
    return resourceService.engine.resourceManager.getStatistics();
  },

  triggerRegeneration: async (_request: FastifyRequest, _reply: FastifyReply) => {
    // Manually trigger a 24-hour regeneration tick
    resourceService.engine.processRegeneration(24);
    return { success: true, message: 'Manual regeneration triggered for 24 hours.' };
  }
};
