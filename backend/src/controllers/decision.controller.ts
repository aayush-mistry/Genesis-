import { FastifyRequest, FastifyReply } from 'fastify';
import { decisionService } from '../services/decision.service';
import { perceptionService } from '../services/perception.service';

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

export const getCandidateActions = async (
  request: FastifyRequest<{ Params: { citizenId: string } }>,
  reply: FastifyReply
) => {
  const { citizenId } = request.params;
  try {
    const context = await perceptionService.engine.buildDecisionContext(citizenId);
    const candidateSet = decisionService.needSystem.generateCandidateActions(context);

    return reply.status(200).send(candidateSet);
  } catch (error: any) {
    return reply.status(400).send({
      success: false,
      message: error.message || 'Failed to retrieve candidate actions',
    });
  }
};

