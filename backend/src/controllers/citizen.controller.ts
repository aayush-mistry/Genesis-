import { FastifyRequest, FastifyReply } from 'fastify';
import { citizenService } from '../services/citizen.service';
import { CitizenGender, SimulationTime } from '@genesis/shared';

export const CitizenController = {
  createCitizen: async (request: FastifyRequest, reply: FastifyReply) => {
    const { gender, locationId, seed, birthDate } = request.body as { 
      gender?: string, 
      locationId?: string | null,
      seed?: number,
      birthDate?: SimulationTime
    };

    if (!gender || !Object.values(CitizenGender).includes(gender as CitizenGender)) {
      return reply.status(400).send({ error: 'Valid gender (MALE, FEMALE, OTHER) is required' });
    }

    try {
      const citizen = citizenService.engine.createCitizen(
        gender as CitizenGender, 
        locationId || null, 
        birthDate, 
        seed
      );
      return reply.send(citizen);
    } catch (error: any) {
      if (error.message.includes('Location validation failed')) {
        return reply.status(404).send({ error: error.message });
      }
      return reply.status(500).send({ error: 'Failed to create citizen', details: error.message });
    }
  },

  getCitizen: async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const citizen = citizenService.engine.getCitizen(id);
    
    if (!citizen) {
      return reply.status(404).send({ error: `Citizen with ID ${id} not found` });
    }

    const age = citizenService.engine.getCitizenAge(citizen);
    return reply.send({ ...citizen, age });
  },

  listCitizens: async (_request: FastifyRequest, reply: FastifyReply) => {
    const citizens = citizenService.engine.listCitizens();
    const citizensWithAge = citizens.map(c => ({
      ...c,
      age: citizenService.engine.getCitizenAge(c)
    }));
    return reply.send(citizensWithAge);
  },

  deleteCitizen: async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const success = citizenService.engine.deleteCitizen(id);
    
    if (!success) {
      return reply.status(404).send({ error: `Citizen with ID ${id} not found` });
    }

    return reply.send({ success: true });
  }
};
