import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { CitizenController } from '../controllers/citizen.controller';

export const citizenRoutes: FastifyPluginAsync = async (server: FastifyInstance) => {
  server.post('/citizens', CitizenController.createCitizen);
  server.get('/citizens', CitizenController.listCitizens);
  server.get('/citizens/:id', CitizenController.getCitizen);
  server.delete('/citizens/:id', CitizenController.deleteCitizen);
  server.get('/citizens/:citizenId/vitals', CitizenController.getCitizenVitals);
  server.get('/world/:worldId/population/vitals', CitizenController.getPopulationVitals);
  
  // Movement endpoints
  server.post('/citizens/:citizenId/movement', CitizenController.requestMovement);
  server.get('/citizens/:citizenId/movement', CitizenController.getMovement);
  server.delete('/citizens/:citizenId/movement', CitizenController.cancelMovement);
};
