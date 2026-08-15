import { FastifyInstance } from 'fastify';
import { SystemController } from '../controllers/system.controller';

export async function systemRoutes(server: FastifyInstance) {
  server.get('/system/status', SystemController.getStatus);
  server.get('/system/verification', SystemController.getVerification);
}
