import { FastifyRequest, FastifyReply } from 'fastify';
import { worldService } from '../services/world.service';

export const WorkplaceController = {
  listWorkplaces: async (_request: FastifyRequest, reply: FastifyReply) => {
    const workplaces = worldService.engine.workplaceRepository.findAll();
    return reply.send(workplaces);
  },

  getWorkplace: async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const workplace = worldService.engine.workplaceRepository.findById(id);

    if (!workplace) {
      return reply.status(404).send({ error: `Workplace with ID ${id} not found` });
    }

    return reply.send(workplace);
  },

  getVacancies: async (_request: FastifyRequest, reply: FastifyReply) => {
    const workplaces = worldService.engine.workplaceRepository.findAll();
    const vacancies = workplaces.filter(w => w.vacancies > 0);
    return reply.send({
      totalWorkplacesWithVacancies: vacancies.length,
      workplaces: vacancies
    });
  }
};
