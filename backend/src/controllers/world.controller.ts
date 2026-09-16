import { FastifyRequest, FastifyReply } from 'fastify';
import { worldService } from '../services/world.service';
import { Region, City, District, Building, DistrictType, BuildingType } from '@genesis/shared';
import { supplyService } from '../services/supply.service';

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

  getSpatialSnapshot: async (_request: FastifyRequest, reply: FastifyReply) => {
    const world = worldService.engine.worldManager.getWorld();
    if (!world) {
      return reply.status(404).send({ error: 'World not initialized' });
    }

    const regions = worldService.engine.regionManager.getAllRegions();
    const cities = worldService.engine.cityManager.getAllCities();
    const districts = worldService.engine.districtManager.getAllDistricts();
    const buildings = worldService.engine.buildingManager.getAllBuildings();
    const workplaces = worldService.engine.workplaceRepository.findAll();

    const { resourceService } = await import('../services/resource.service');
    const resources = resourceService.engine.resourceManager.getAllResources();

    const { citizenService } = await import('../services/citizen.service');
    const citizens = citizenService.engine.listCitizens();
    
    // Quick fix: directly fetch households from DB or use a service if it exists
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();
    const dbHouseholds = await prisma.household.findMany();
    // Re-fetch citizens to ensure we get coordX and coordY if the engine didn't cache it
    const dbCitizens = await prisma.citizen.findMany();
    const dbBuildings = await prisma.building.findMany();
    const dbTerrains = await prisma.terrain.findMany();
    await prisma.$disconnect();

    const mapCoordinates = (item: any) => ({
      ...item,
      coordinates: { x: item.coordX ?? 0, y: item.coordY ?? 0 }
    });

    const mappedCitizens = dbCitizens.map(mapCoordinates);

    // Generate population clusters
    const clusterMap = new Map<string, any>();
    mappedCitizens.forEach(citizen => {
      const locId = citizen.locationId || 'unknown';
      if (!clusterMap.has(locId)) {
        // Find parent building or district to get coords if citizen coords are missing
        const building = dbBuildings.find(b => b.id === locId);
        let cx = citizen.coordinates.x;
        let cy = citizen.coordinates.y;
        
        if (building) {
          cx = cx || building.coordX;
          cy = cy || building.coordY;
        }

        clusterMap.set(locId, {
          clusterId: `cluster-${locId}`,
          x: cx,
          y: cy,
          population: 0,
          bounds: building ? { width: building.width, height: building.height } : null,
          parentRegionId: building ? cities.find(c => districts.find(d => d.id === building.districtId)?.cityId === c.id)?.regionId : null,
          parentCityId: building ? districts.find(d => d.id === building.districtId)?.cityId : null,
          parentDistrictId: building ? building.districtId : null
        });
      }
      clusterMap.get(locId).population++;
    });

    return reply.send({
      world,
      regions,
      cities,
      districts,
      buildings: dbBuildings.map(mapCoordinates), // Use DB directly for now to get backfilled ones
      workplaces,
      resources,
      terrain: dbTerrains.map(mapCoordinates),
      citizens: mappedCitizens,
      households: dbHouseholds.map(mapCoordinates),
      populationClusters: Array.from(clusterMap.values())
    });
  },

  createWorld: async (request: FastifyRequest, _reply: FastifyReply) => {
    const { name, description, seed } = request.body as { name: string; description: string; seed: number };
    
    // Use the unified populated world generation method
    const world = await worldService.generatePopulatedWorld(name, description, seed);
    
    return world;
  },

  deleteWorld: async (_request: FastifyRequest, _reply: FastifyReply) => {
    worldService.engine.reset();
    import('../services/supply.service').then(m => m.supplyService.reset());
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
