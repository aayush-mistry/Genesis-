import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { getDecisionHistory, getCandidateActions } from '../controllers/decision.controller';

const decisionRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  fastify.get('/citizens/:citizenId/decisions', getDecisionHistory);
  fastify.get('/citizens/:citizenId/candidates', getCandidateActions);
};

export default decisionRoutes;
