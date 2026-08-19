import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { getDecisionHistory, getCandidateActions, getDecision } from '../controllers/decision.controller';

const decisionRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  fastify.get('/citizens/:citizenId/decisions', getDecisionHistory);
  fastify.get('/citizens/:citizenId/candidates', getCandidateActions);
  fastify.get('/citizens/:citizenId/decision', getDecision);
};

export default decisionRoutes;
