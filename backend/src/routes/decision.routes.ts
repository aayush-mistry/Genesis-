import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { getDecisionHistory } from '../controllers/decision.controller';

const decisionRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  fastify.get('/citizens/:citizenId/decisions', getDecisionHistory);
};

export default decisionRoutes;
