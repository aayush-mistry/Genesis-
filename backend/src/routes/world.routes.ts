import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { WorldController } from '../controllers/world.controller';
import { EntityController } from '../controllers/entity.controller';

export const worldRoutes: FastifyPluginAsync = async (server: FastifyInstance) => {
  // World
  server.get('/world/status', WorldController.getWorldStatus);
  server.get('/world', WorldController.getWorld);
  server.get('/world/spatial', WorldController.getSpatialSnapshot);
  server.get('/world/spatial/dynamic', WorldController.getDynamicSpatialState);
  server.post('/world', WorldController.createWorld);
  server.delete('/world', WorldController.deleteWorld);
  server.get('/world/summary', WorldController.getWorldSummary);
  server.get('/world/hierarchy', WorldController.getHierarchy);
  
  // Entities
  server.get('/world/entities/search', EntityController.searchEntities);
  server.get('/world/entities/:type/:id', EntityController.getEntityDetail);
  server.get('/world/entities/:type/:id/path', EntityController.getHierarchyPath);

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
