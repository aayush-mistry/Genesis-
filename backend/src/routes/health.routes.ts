import { FastifyInstance } from 'fastify';
import { HealthController } from '../controllers/health.controller';

export async function healthRoutes(fastify: FastifyInstance) {
  const healthController = new HealthController();
  
  fastify.get('/health', healthController.checkHealth.bind(healthController));
}
