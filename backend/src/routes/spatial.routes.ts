import { FastifyInstance } from 'fastify';
import { SpatialController } from '../controllers/spatial.controller';

export async function spatialRoutes(server: FastifyInstance) {
  server.get('/distance', SpatialController.getDistance);
  server.get('/nearby', SpatialController.getNearby);
  server.get('/nearest', SpatialController.getNearest);
  server.get('/region/:regionId', SpatialController.getEntitiesInRegion);
  server.get('/statistics', SpatialController.getStatistics);
}
