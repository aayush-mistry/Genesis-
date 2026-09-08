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

  async createDistrict(data: any) {
    return prisma.district.create({ data });
  }

  async createBuilding(data: any) {
    return prisma.building.create({ data });
  }

  async updateRegion(id: string, data: any) {
    return prisma.region.update({ where: { id }, data });
  }

  async updateCity(id: string, data: any) {
    return prisma.city.update({ where: { id }, data });
  }

  async updateDistrict(id: string, data: any) {
    return prisma.district.update({ where: { id }, data });
  }

  async updateBuilding(id: string, data: any) {
    return prisma.building.update({ where: { id }, data });
  }
}

export const worldRepository = new WorldRepository();
