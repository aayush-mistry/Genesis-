import { FastifyInstance } from 'fastify';
import { PerceptionController } from '../controllers/perception.controller';

export async function perceptionRoutes(fastify: FastifyInstance) {
  fastify.get('/perception/:citizenId/snapshot', PerceptionController.getSnapshot);
  fastify.get('/perception/:citizenId/context', PerceptionController.getDecisionContext);
}
