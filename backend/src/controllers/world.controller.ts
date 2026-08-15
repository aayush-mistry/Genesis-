import { FastifyRequest, FastifyReply } from 'fastify';
import { worldService } from '../services/world.service';
import { Region, City, District, Building } from '@genesis/shared';

export const WorldController = {
  // --- World ---
  getWorldStatus: async (_request: FastifyRequest, _reply: FastifyReply) => {
    const world = worldService.engine.worldManager.getWorld();
    return { initialized: !!world };
  },

  getWorld: async (_request: FastifyRequest, reply: FastifyReply) => {
    const world = worldService.engine.worldManager.getWorld();
    return world ? world : reply.status(404).send({ error: 'World not found' });
  },

  createWorld: async (request: FastifyRequest, _reply: FastifyReply) => {
    const { name, description, seed } = request.body as { name: string; description: string; seed: number };
    const world = worldService.engine.worldManager.createWorld(name, description, seed);
    return world;
  },

  deleteWorld: async (_request: FastifyRequest, _reply: FastifyReply) => {
    worldService.engine.worldManager.resetWorld();
    return { success: true };
  },

  // --- Hierarchy ---
  getHierarchy: async (_request: FastifyRequest, reply: FastifyReply) => {
    const world = worldService.engine.worldManager.getWorld();
    if (!world) {
      return reply.status(404).send({ error: 'World not found' });
    }

    const regions = worldService.engine.regionManager.getAllRegions();
    const cities = worldService.engine.cityManager.getAllCities();
    const districts = worldService.engine.districtManager.getAllDistricts();
    const buildings = worldService.engine.buildingManager.getAllBuildings();

    // Build nested structure
    const hierarchy = {
      world,
      regions: regions.map(r => ({
        ...r,
        cities: cities.filter(c => c.regionId === r.id).map(c => ({
          ...c,
          districts: districts.filter(d => d.cityId === c.id).map(d => ({
            ...d,
            buildings: buildings.filter(b => b.districtId === d.id)
          }))
        }))
      }))
    };

    return hierarchy;
  },

  // --- Regions ---
  getRegions: async (_request: FastifyRequest, _reply: FastifyReply) => {
    return worldService.engine.regionManager.getAllRegions();
  },

  createRegion: async (request: FastifyRequest, _reply: FastifyReply) => {
    const data = request.body as Omit<Region, 'id' | 'cityIds'>;
    const region = worldService.engine.regionManager.createRegion(data);
    worldService.engine.worldManager.addRegion(region.id);
    
    // Auto-generate resources for this new region
    const world = worldService.engine.worldManager.getWorld();
    if (world) {
      import('../services/resource.service').then(m => {
        m.resourceService.engine.generateResourcesForRegion(region.id, world.randomSeed);
      });
    }

    return region;
  },

  // --- Cities ---
  getCities: async (_request: FastifyRequest, _reply: FastifyReply) => {
    return worldService.engine.cityManager.getAllCities();
  },

  createCity: async (request: FastifyRequest, _reply: FastifyReply) => {
    const data = request.body as Omit<City, 'id' | 'districtIds' | 'districtCount' | 'buildingCount'>;
    const city = worldService.engine.cityManager.createCity(data);
    worldService.engine.regionManager.addCity(city.regionId, city.id);
    return city;
  },

  // --- Districts ---
  getDistricts: async (_request: FastifyRequest, _reply: FastifyReply) => {
    return worldService.engine.districtManager.getAllDistricts();
  },

  createDistrict: async (request: FastifyRequest, _reply: FastifyReply) => {
    const data = request.body as Omit<District, 'id' | 'buildingIds'>;
    const district = worldService.engine.districtManager.createDistrict(data);
    worldService.engine.cityManager.addDistrict(district.cityId, district.id);
    return district;
  },

  // --- Buildings ---
  getBuildings: async (_request: FastifyRequest, _reply: FastifyReply) => {
    return worldService.engine.buildingManager.getAllBuildings();
  },

  createBuilding: async (request: FastifyRequest, _reply: FastifyReply) => {
    const data = request.body as Omit<Building, 'id' | 'roomIds'>;
    const building = worldService.engine.buildingManager.createBuilding(data);
    worldService.engine.districtManager.addBuilding(building.districtId, building.id);
    return building;
  },
};
