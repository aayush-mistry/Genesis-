import { FastifyRequest, FastifyReply } from 'fastify';
import { decisionService } from '../services/decision.service';

export const getDecisionHistory = async (
  request: FastifyRequest<{ Params: { citizenId: string } }>,
  reply: FastifyReply
) => {
  const { citizenId } = request.params;
  try {
    const history = decisionService.engine.getHistory(citizenId);
    return reply.status(200).send({
      success: true,
      data: history
    });
  } catch (error: any) {
    return reply.status(400).send({
      success: false,
      message: error.message || 'Failed to retrieve decision history',
    });
  }
};
