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

  async listWorkplaces() {
    return prisma.workplace.findMany({
      include: {
        positions: true,
      }
    });
  }

  async createWorkplace(data: any) {
    return prisma.workplace.create({ data });
  }

  async createManyWorkplaces(data: any[]) {
    return prisma.workplace.createMany({ data });
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

  async updateFinancials(
    id: string,
    revenue: number,
    expenses: number,
    profit: number,
    occupiedPositions?: number,
    vacancies?: number,
    accountingHistoryJson?: string | null
  ) {
    return prisma.workplace.update({
      where: { id },
      data: {
        revenue,
        expenses,
        profit,
        ...(occupiedPositions !== undefined ? { occupiedPositions } : {}),
        ...(vacancies !== undefined ? { vacancies } : {}),
        ...(accountingHistoryJson !== undefined ? { accountingHistoryJson } : {})
      }
    });
  }
}

export const workplaceRepository = new WorkplaceRepository();
