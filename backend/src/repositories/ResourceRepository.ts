import { prisma } from './prisma';

export class ResourceRepository {
  async getResourcesByRegion(regionId: string) {
    return prisma.resource.findMany({
      where: { regionId }
    });
  }

  async updateQuantity(id: string, currentAmount: number) {
    return prisma.resource.update({
      where: { id },
      data: { currentAmount }
    });
  }
  
  async createResource(data: any) {
    return prisma.resource.create({ data });
  }
}

export const resourceRepository = new ResourceRepository();
