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
    return prisma.world.upsert({
      where: { id: data.id },
      update: data,
      create: data
    });
  }

  async deleteWorld(id: string) {
    return prisma.world.delete({
      where: { id }
    });
  }

  async createRegion(data: any) {
    return prisma.region.upsert({
      where: { id: data.id },
      update: data,
      create: data
    });
  }

  async createCity(data: any) {
    return prisma.city.upsert({
      where: { id: data.id },
      update: data,
      create: data
    });
  }

  async createDistrict(data: any) {
    return prisma.district.upsert({
      where: { id: data.id },
      update: data,
      create: data
    });
  }

  async createBuilding(data: any) {
    const payload = { ...data };
    if (payload.metadata && !payload.metadataJson) {
      payload.metadataJson = typeof payload.metadata === 'string' ? payload.metadata : JSON.stringify(payload.metadata);
      delete payload.metadata;
    }
    return prisma.building.upsert({
      where: { id: payload.id },
      update: payload,
      create: payload
    });
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
    const payload = { ...data };
    if (payload.metadata && !payload.metadataJson) {
      payload.metadataJson = typeof payload.metadata === 'string' ? payload.metadata : JSON.stringify(payload.metadata);
      delete payload.metadata;
    }
    return prisma.building.update({ where: { id }, data: payload });
  }
}

export const worldRepository = new WorldRepository();
