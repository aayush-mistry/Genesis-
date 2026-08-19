import { FastifyRequest, FastifyReply } from 'fastify';
import { perceptionService } from '../services/perception.service';

export const PerceptionController = {
  getSnapshot: async (request: FastifyRequest, reply: FastifyReply) => {
    const { citizenId } = request.params as { citizenId: string };
    
    try {
      const snapshot = await perceptionService.engine.generateSnapshot(citizenId);
      return reply.send(snapshot);
    } catch (error: any) {
      if (error.message.includes('not found')) {
        return reply.status(404).send({ error: error.message });
      }
      return reply.status(500).send({ error: 'Failed to generate perception snapshot', details: error.message });
    }
  },

  getDecisionContext: async (request: FastifyRequest, reply: FastifyReply) => {
    const { citizenId } = request.params as { citizenId: string };
    
    try {
      const context = await perceptionService.engine.buildDecisionContext(citizenId);
      return reply.send(context);
    } catch (error: any) {
      if (error.message.includes('not found')) {
        return reply.status(404).send({ error: error.message });
      }
      return reply.status(500).send({ error: 'Failed to build decision context', details: error.message });
    }
  }
};
