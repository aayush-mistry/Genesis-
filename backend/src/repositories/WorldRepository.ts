import { prisma } from './prisma';

export class WorldRepository {
  async getWorld(id: string) {
    return prisma.world.findUnique({
      where: { id },
      include: {
        regions: {
          include: {
            cities: {
              include: {
                districts: {
                  include: {
                    buildings: {
                      include: {
                        rooms: true
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    });
  }

  async createWorld(data: any) {
    return prisma.world.create({ data });
  }

  async deleteWorld(id: string) {
    return prisma.world.delete({
      where: { id }
    });
  }

  async createRegion(data: any) {
    return prisma.region.create({ data });
  }

  async createCity(data: any) {
    return prisma.city.create({ data });
  }
}

export const worldRepository = new WorldRepository();
