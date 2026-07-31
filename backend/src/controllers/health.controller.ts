import { FastifyReply, FastifyRequest } from 'fastify';
import { HealthService } from '../services/health.service';

export class HealthController {
  private healthService: HealthService;

  constructor() {
    this.healthService = new HealthService();
  }

  async checkHealth(request: FastifyRequest, reply: FastifyReply) {
    const status = await this.healthService.getSystemStatus();
    return reply.send(status);
  }
}
