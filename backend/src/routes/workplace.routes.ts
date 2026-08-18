import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { WorkplaceController } from '../controllers/workplace.controller';

export const workplaceRoutes: FastifyPluginAsync = async (server: FastifyInstance) => {
  server.get('/workplaces', WorkplaceController.listWorkplaces);
  server.get('/workplaces/:id', WorkplaceController.getWorkplace);
  server.get('/jobs/vacancies', WorkplaceController.getVacancies);
};
