import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { CitizenController } from '../controllers/citizen.controller';

export const citizenRoutes: FastifyPluginAsync = async (server: FastifyInstance) => {
  server.post('/citizens', CitizenController.createCitizen);
  server.get('/citizens', CitizenController.listCitizens);
  server.get('/citizens/:id', CitizenController.getCitizen);
  server.delete('/citizens/:id', CitizenController.deleteCitizen);
};
