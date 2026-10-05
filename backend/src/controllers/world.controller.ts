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

  getWorldSummary: async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { civilizationIntelligenceService } = await import('../services/civilizationIntelligence.service');
      const summary = await civilizationIntelligenceService.getCivilizationSummary();
      return reply.send(summary);
    } catch (e) {
      console.error(e);
      return reply.status(500).send({ error: 'Failed to aggregate world summary.' });
    }
  },

  getSpatialSnapshot: async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
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
      
      const { prisma } = await import('../repositories/prisma');
      const dbHouseholds = await prisma.household.findMany();
      const dbCitizens = await prisma.citizen.findMany();
      const dbBuildings = await prisma.building.findMany();
      const dbTerrains = await prisma.terrain.findMany();

      const mapCoordinates = (item: any) => ({
        ...item,
        coordinates: { x: item.coordX ?? 0, y: item.coordY ?? 0 }
      });

      const mappedCitizens = dbCitizens.map(mapCoordinates);

      const clusterMap = new Map<string, any>();
      mappedCitizens.forEach(citizen => {
        const locId = citizen.locationId || 'unknown';
        if (!clusterMap.has(locId)) {
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
        
        if (['HOSPITAL', 'SCHOOL', 'POLICE_STATION', 'FIRE_STATION', 'WHOLESALE'].includes(wp.type)) {
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
        buildings: dbBuildings.map(mapCoordinates),
        workplaces: mappedWorkplaces,
        resources,
        terrain: dbTerrains.map(mapCoordinates),
        citizens: mappedCitizens,
        households: dbHouseholds.map(mapCoordinates),
        populationClusters: Array.from(clusterMap.values())
      });
    } catch (error) {
      console.error('getSpatialSnapshot error:', error);
      return reply.status(500).send({ error: 'Internal Server Error in getSpatialSnapshot', details: (error as any).message });
    }
  },

  getDynamicSpatialState: async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      const world = worldService.engine.worldManager.getWorld();
      if (!world) {
        return reply.status(404).send({ error: 'World not initialized' });
      }

      const { citizenService } = await import('../services/citizen.service');
      const { spatialService } = await import('../services/spatial.service');
      const citizens = citizenService.engine.listCitizens();
      
      const { prisma } = await import('../repositories/prisma');
      const dbBuildings = await prisma.building.findMany();

      const { timeService } = await import('../services/time.service');
      const currentTime = timeService.engine.getCurrentTime();

      const clusterMap = new Map<string, any>();
      const { TimeUtils } = await import('@genesis/engine');

      const mappedCitizens = citizens.map(citizen => {
        let x = citizen.coordX ?? 0;
        let y = citizen.coordY ?? 0;
        let destinationX: number | undefined = undefined;
        let destinationY: number | undefined = undefined;
        let travelProgress: number | undefined = undefined;

        const exactCoords = spatialService.engine.queryService.resolveCitizenLocation(citizen, currentTime);
        if (exactCoords) {
          x = exactCoords.x;
          y = exactCoords.y;
        }

        if (citizen.movementState === 'TRAVELLING' && citizen.activeRoute) {
          const route = citizen.activeRoute;
          const destCoords = spatialService.engine.queryService['worldEngine'].getEntityCoordinates(route.destinationId);
          
          if (destCoords) {
             destinationX = destCoords.x;
             destinationY = destCoords.y;
          }

          const startSecs = TimeUtils.toSeconds(route.startedAtSimulationTime);
          const expectedSecs = TimeUtils.toSeconds(route.expectedArrivalSimulationTime);
          const currentSecs = TimeUtils.toSeconds(currentTime);
          
          if (expectedSecs > startSecs) {
             travelProgress = Math.min(1, Math.max(0, (currentSecs - startSecs) / (expectedSecs - startSecs)));
          } else {
             travelProgress = 1;
          }
        }

        const locId = citizen.locationId || 'unknown';
        if (!clusterMap.has(locId)) {
          const b = dbBuildings.find(b => b.id === locId);
          clusterMap.set(locId, {
            clusterId: `cluster-${locId}`,
            x: b ? b.coordX : x,
            y: b ? b.coordY : y,
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
    } catch (error) {
      console.error('getDynamicSpatialState error:', error);
      return reply.status(500).send({ error: 'Internal Server Error in getDynamicSpatialState', details: (error as any).message });
    }
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
