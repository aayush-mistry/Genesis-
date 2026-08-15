import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { WorldController } from '../controllers/world.controller';

export const worldRoutes: FastifyPluginAsync = async (server: FastifyInstance) => {
  // World
  server.get('/world/status', WorldController.getWorldStatus);
  server.get('/world', WorldController.getWorld);
  server.post('/world', WorldController.createWorld);
  server.delete('/world', WorldController.deleteWorld);
  server.get('/world/hierarchy', WorldController.getHierarchy);

  // Regions
  server.get('/regions', WorldController.getRegions);
  server.post('/regions', WorldController.createRegion);

  // Cities
  server.get('/cities', WorldController.getCities);
  server.post('/cities', WorldController.createCity);

  // Districts
  server.get('/districts', WorldController.getDistricts);
  server.post('/districts', WorldController.createDistrict);

  // Buildings
  server.get('/buildings', WorldController.getBuildings);
  server.post('/buildings', WorldController.createBuilding);
};
