import { FastifyInstance } from 'fastify';
import { ResourceController } from '../controllers/resource.controller';

export async function resourceRoutes(server: FastifyInstance) {
  server.get('/resources', ResourceController.getAllResources);
  server.get('/resources/statistics', ResourceController.getStatistics);
  server.get('/resources/regions/:regionId', ResourceController.getResourcesByRegion);
  server.get('/resources/regions/:regionId/:resourceId', ResourceController.getResourceById);
  server.post('/resources/regenerate', ResourceController.triggerRegeneration);
}
