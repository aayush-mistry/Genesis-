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

    const { SeededRandom } = await import('@genesis/engine');
    const mappedWorkplaces = workplaces.map(wp => {
      const building = dbBuildings.find(b => b.id === wp.locationId);
      if (building) {
        return { ...wp, coordinates: { x: building.coordX, y: building.coordY } };
      }
      if (['FARM', 'MINE', 'FISHING_SITE', 'FOREST_SITE'].includes(wp.type)) {
        const region = regions.find(r => r.id === wp.regionId);
        if (region) {
          let hash = 0;
          for (let i = 0; i < wp.id.length; i++) {
             hash = ((hash << 5) - hash) + wp.id.charCodeAt(i);
             hash |= 0;
          }
          const wpRng = new SeededRandom(world.randomSeed ^ hash);
          return {
            ...wp,
            coordinates: { 
              x: region.coordinates.x + Math.floor(wpRng.nextFloat(-1200, 1200)),
              y: region.coordinates.y + Math.floor(wpRng.nextFloat(-1200, 1200))
            }
          };
        }
      }
      
      // Civic Workplaces (No building, attached to City)
      if (['HOSPITAL', 'SCHOOL', 'POLICE_STATION', 'FIRE_STATION', 'WHOLESALE'].includes(wp.type)) {
        // locationId for these is usually the cityId
        const city = cities.find(c => c.id === wp.locationId) || cities.find(c => c.regionId === wp.regionId);
        if (city) {
          let hash = 0;
          for (let i = 0; i < wp.id.length; i++) {
             hash = ((hash << 5) - hash) + wp.id.charCodeAt(i);
             hash |= 0;
          }
          const wpRng = new SeededRandom(world.randomSeed ^ hash);
          return {
            ...wp,
            coordinates: { 
              x: city.coordinates.x + Math.floor(wpRng.nextFloat(-city.width/3, city.width/3)),
              y: city.coordinates.y + Math.floor(wpRng.nextFloat(-city.height/3, city.height/3))
            }
          };
        }
      }
      return { ...wp, coordinates: { x: 0, y: 0 } };
    });

    return reply.send({
      world,
      regions,
      cities,
      districts,
      buildings: dbBuildings.map(mapCoordinates), // Use DB directly for now to get backfilled ones
      workplaces: mappedWorkplaces,
      resources,
      terrain: dbTerrains.map(mapCoordinates),
      citizens: mappedCitizens,
      households: dbHouseholds.map(mapCoordinates),
      populationClusters: Array.from(clusterMap.values())
    });
  },

  getDynamicSpatialState: async (_request: FastifyRequest, reply: FastifyReply) => {
    const world = worldService.engine.worldManager.getWorld();
    if (!world) {
      return reply.status(404).send({ error: 'World not initialized' });
    }

    const { citizenService } = await import('../services/citizen.service');
    const citizens = citizenService.engine.listCitizens();
    
    // Quick fix: directly fetch buildings and workplaces for location resolution
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();
    const dbBuildings = await prisma.building.findMany();
    const dbCitizens = await prisma.citizen.findMany(); // to get persisted coords if needed
    await prisma.$disconnect();

    const { timeService } = await import('../services/time.service');
    const currentTime = timeService.engine.getCurrentTime();

    // Map building coords for quick lookup
    const buildingMap = new Map<string, { x: number, y: number, width: number, height: number }>();
    dbBuildings.forEach(b => buildingMap.set(b.id, { x: b.coordX, y: b.coordY, width: b.width, height: b.height }));

    // Generate population clusters
    const clusterMap = new Map<string, any>();
    const { SeededRandom, TimeUtils } = await import('@genesis/engine');

    const mappedCitizens = citizens.map(citizen => {
      const dbCit = dbCitizens.find(c => c.id === citizen.id);
      
      let x = dbCit?.coordX ?? 0;
      let y = dbCit?.coordY ?? 0;
      let destinationX: number | undefined = undefined;
      let destinationY: number | undefined = undefined;
      let travelProgress: number | undefined = undefined;

      if (citizen.movementState === 'IDLE' && citizen.locationId) {
        const b = buildingMap.get(citizen.locationId);
        if (b) {
           let hash = 0;
           for (let i = 0; i < citizen.id.length; i++) {
              hash = ((hash << 5) - hash) + citizen.id.charCodeAt(i);
              hash |= 0;
           }
           const cRng = new SeededRandom(world.randomSeed ^ hash);
           // Add deterministic jitter so they don't stack perfectly
           x = b.x + Math.floor(cRng.nextFloat(-b.width/4, b.width/4));
           y = b.y + Math.floor(cRng.nextFloat(-b.height/4, b.height/4));
        }
      } else if (citizen.movementState === 'TRAVELLING' && citizen.activeRoute) {
        const route = citizen.activeRoute;
        const srcB = buildingMap.get(route.sourceId);
        const destB = buildingMap.get(route.destinationId);
        
        let startX = x, startY = y;
        if (srcB) { startX = srcB.x; startY = srcB.y; }
        
        if (destB) {
           destinationX = destB.x;
           destinationY = destB.y;
        }

        const startSecs = TimeUtils.toSeconds(route.startedAtSimulationTime);
        const expectedSecs = TimeUtils.toSeconds(route.expectedArrivalSimulationTime);
        const currentSecs = TimeUtils.toSeconds(currentTime);
        
        if (expectedSecs > startSecs) {
           travelProgress = Math.min(1, Math.max(0, (currentSecs - startSecs) / (expectedSecs - startSecs)));
        } else {
           travelProgress = 1;
        }
        
        // Let frontend interpolate, but we can send current interpolated pos as x, y fallback
        if (destinationX !== undefined && destinationY !== undefined) {
           x = startX + (destinationX - startX) * travelProgress;
           y = startY + (destinationY - startY) * travelProgress;
        }
      }

      // Aggregate clusters
      const locId = citizen.locationId || 'unknown';
      if (!clusterMap.has(locId)) {
        const b = buildingMap.get(locId);
        clusterMap.set(locId, {
          clusterId: `cluster-${locId}`,
          x: b ? b.x : x,
          y: b ? b.y : y,
          population: 0
        });
      }
      clusterMap.get(locId).population++;

      return {
        id: citizen.id,
        householdId: citizen.householdId,
        workplaceId: citizen.workplaceId,
        x,
        y,
        locationId: citizen.locationId,
        movementState: citizen.movementState,
        activeRoute: citizen.activeRoute,
        destinationX,
        destinationY,
        travelProgress
      };
    });

    return reply.send({
      time: currentTime,
      citizens: mappedCitizens,
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
