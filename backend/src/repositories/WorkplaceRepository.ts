import { prisma } from './prisma';

export class WorkplaceRepository {
  async getWorkplace(id: string) {
    return prisma.workplace.findUnique({
      where: { id },
      include: {
        positions: true,
      }
    });
  }

  async createWorkplace(data: any) {
    return prisma.workplace.create({ data });
  }

  async updateOccupancy(id: string, vacancies: number, occupied: number) {
    return prisma.workplace.update({
      where: { id },
      data: {
        vacancies,
        occupiedPositions: occupied,
      }
    });
  }
}

export const workplaceRepository = new WorkplaceRepository();
