import { prisma } from './prisma';

export class CitizenRepository {
  async getCitizen(id: string) {
    return prisma.citizen.findUnique({
      where: { id },
      include: {
        household: true,
        jobPosition: true,
      }
    });
  }

  async listCitizens() {
    return prisma.citizen.findMany();
  }

  async createCitizen(data: any) {
    return prisma.citizen.create({ data });
  }

  async updateCitizen(id: string, data: any) {
    return prisma.citizen.update({
      where: { id },
      data
    });
  }
}

export const citizenRepository = new CitizenRepository();
