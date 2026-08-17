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
  },

  getCitizenVitals: async (request: FastifyRequest, reply: FastifyReply) => {
    const { citizenId } = request.params as { citizenId: string };
    const citizen = citizenService.engine.getCitizen(citizenId);

    if (!citizen) {
      return reply.status(404).send({ error: `Citizen with ID ${citizenId} not found` });
    }

    return reply.send(citizen.vitalState);
  },

  getPopulationVitals: async (_request: FastifyRequest, reply: FastifyReply) => {
    const citizens = citizenService.engine.listCitizens().filter(c => c.status === 'ACTIVE');
    
    if (citizens.length === 0) {
      return reply.send({ message: 'No active citizens found' });
    }

    let totalHunger = 0;
    let totalThirst = 0;
    let totalEnergy = 0;
    let totalHealth = 0;

    let criticalHungerCount = 0;
    let criticalThirstCount = 0;
    let lowHealthCount = 0;

    for (const citizen of citizens) {
      const v = citizen.vitalState;
      totalHunger += v.hunger;
      totalThirst += v.thirst;
      totalEnergy += v.energy;
      totalHealth += v.health;

      if (v.hunger >= 90) criticalHungerCount++;
      if (v.thirst >= 90) criticalThirstCount++;
      if (v.health <= 20) lowHealthCount++;
    }

    const count = citizens.length;
    return reply.send({
      populationSize: count,
      averageHunger: totalHunger / count,
      averageThirst: totalThirst / count,
      averageEnergy: totalEnergy / count,
      averageHealth: totalHealth / count,
      criticalHungerCount,
      criticalThirstCount,
      lowHealthCount
    });
  }
};
