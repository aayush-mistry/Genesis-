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

  createWorld: async (request: FastifyRequest, _reply: FastifyReply) => {
    const { name, description, seed } = request.body as { name: string; description: string; seed: number };
    const world = worldService.engine.worldManager.createWorld(name, description, seed);
    
    // Auto-create a default region so the UI has something to display (e.g. resources)
    const defaultRegion = worldService.engine.regionManager.createRegion({
      name: 'Genesis Valley',
      climate: 'Temperate',
      description: 'The cradle of civilization in this world.',
      population: 0,
      coordinates: { x: 0, y: 0 },
      worldId: world.id,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    worldService.engine.worldManager.addRegion(defaultRegion.id);
    
    // Auto-generate resources for this new region
    import('../services/resource.service').then(m => {
      m.resourceService.engine.generateResourcesForRegion(defaultRegion.id, world.randomSeed);
    });

    // Generate basic urban hierarchy to allow workplaces to spawn
    const city = worldService.engine.cityManager.createCity({
      name: 'Genesis City',
      regionId: defaultRegion.id,
      coordinates: { x: 0, y: 0 },
      population: 0,
      area: 100,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    worldService.engine.regionManager.addCity(defaultRegion.id, city.id);

    const district = worldService.engine.districtManager.createDistrict({
      name: 'Central District',
      cityId: city.id,
      type: DistrictType.COMMERCIAL,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    worldService.engine.cityManager.addDistrict(city.id, district.id);

    const factoryBuilding = worldService.engine.buildingManager.createBuilding({
      name: 'Central Factory',
      districtId: district.id,
      type: BuildingType.FACTORY,
      capacity: 100,
      coordinates: { x: 0, y: 0 },
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date()
    });
    worldService.engine.districtManager.addBuilding(district.id, factoryBuilding.id);
    
    const storeBuilding = worldService.engine.buildingManager.createBuilding({
      name: 'General Store',
      districtId: district.id,
      type: BuildingType.STORE,
      capacity: 50,
      coordinates: { x: 0, y: 0 },
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date()
    });
    worldService.engine.districtManager.addBuilding(district.id, storeBuilding.id);

    // Generate Workplaces
    worldService.engine.workplaceGenerator.generateWorkplaces();

    // Initialize Inventories for Producers
    const workplaces = worldService.engine.workplaceRepository.findAll();
    for (const wp of workplaces) {
      if (['FARM', 'MINE', 'FISHING_SITE', 'FOREST_SITE', 'FACTORY', 'SHOP', 'BUSINESS'].includes(wp.type)) {
        // Create an inventory for this workplace
        const inventoryId = `inv-${wp.id}`;
        const storageCapacity = wp.capacity * 1000; // 1000 units per worker capacity
        supplyService.inventoryManager.createInventory(inventoryId, wp.id, storageCapacity);
        
        // Update workplace with inventory reference
        wp.inventoryId = inventoryId;
        wp.storageCapacity = storageCapacity;
        worldService.engine.workplaceRepository.update(wp);
      }
    }

    // Initialize population
    import('../services/citizen.service').then(m => {
      m.citizenService.simulator.initializePopulation(5000);
    });
    
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
