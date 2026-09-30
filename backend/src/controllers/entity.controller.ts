import { FastifyRequest, FastifyReply } from 'fastify';
import { worldService } from '../services/world.service';
import { PrismaClient } from '@prisma/client';

export const EntityController = {
  getEntityDetail: async (request: FastifyRequest<{ Params: { type: string, id: string } }>, reply: FastifyReply) => {
    const { type, id } = request.params;
    
    // Dynamic import for specific engines to avoid circular deps if they exist
    const { citizenService } = await import('../services/citizen.service');
    const { resourceService } = await import('../services/resource.service');
    const { timeService } = await import('../services/time.service');
    const { spatialService } = await import('../services/spatial.service');

    const prisma = new PrismaClient();
    try {
      if (type === 'region') {
        const region = worldService.engine.regionManager.getRegion(id);
        if (!region) return reply.status(404).send({ error: 'Region not found' });
        const cities = worldService.engine.cityManager.getAllCities().filter(c => c.regionId === id);
        const resources = resourceService.engine.resourceManager.getAllResources().filter(r => r.regionId === id);
        return reply.send({ ...region, cities: cities.map(c => c.id), resources: resources.map(r => r.id) });
      } 
      
      else if (type === 'city') {
        const city = worldService.engine.cityManager.getCity(id);
        if (!city) return reply.status(404).send({ error: 'City not found' });
        const districts = worldService.engine.districtManager.getAllDistricts().filter(d => d.cityId === id);
        const buildings = worldService.engine.buildingManager.getAllBuildings().filter(b => districts.some(d => d.id === b.districtId));
        return reply.send({ ...city, districts: districts.map(d => d.id), buildings: buildings.map(b => b.id) });
      }
      
      else if (type === 'district') {
        const district = worldService.engine.districtManager.getDistrict(id);
        if (!district) return reply.status(404).send({ error: 'District not found' });
        const buildings = worldService.engine.buildingManager.getAllBuildings().filter(b => b.districtId === id);
        return reply.send({ ...district, buildings: buildings.map(b => b.id) });
      }
      
      else if (type === 'building') {
        const building = worldService.engine.buildingManager.getBuilding(id) || await prisma.building.findUnique({ where: { id } });
        if (!building) return reply.status(404).send({ error: 'Building not found' });
        const workplaces = worldService.engine.workplaceRepository.findAll().filter(w => w.locationId === id);
        const households = await prisma.household.findMany({ where: { locationId: id } });
        return reply.send({ ...building, workplaces: workplaces.map(w => w.id), households: households.map(h => h.id) });
      }
      
      else if (type === 'workplace') {
        const workplace = worldService.engine.workplaceRepository.findById(id);
        if (!workplace) return reply.status(404).send({ error: 'Workplace not found' });
        
        // Detailed info
        const building = await prisma.building.findUnique({ where: { id: workplace.locationId } });
        const workers = citizenService.engine.listCitizens().filter(c => c.workplaceId === id);
        
        // Add financial/inventory data if applicable
        const wallet = workplace.wallet;
        const { supplyService } = await import('../services/supply.service');
        const inventory = workplace.inventoryId ? supplyService.inventoryManager?.getInventory(workplace.inventoryId) : null;
        
        return reply.send({ 
          ...workplace, 
          buildingId: building?.id, 
          districtId: building?.districtId,
          workers: workers.map(w => w.id),
          finances: wallet ? { balance: wallet.balance } : null,
          inventory: inventory ? { items: Object.values(inventory.items) } : null
        });
      }
      
      else if (type === 'household') {
        const household = await prisma.household.findUnique({ where: { id } });
        if (!household) return reply.status(404).send({ error: 'Household not found' });
        
        const members = await prisma.citizen.findMany({ where: { householdId: id } });
        
        return reply.send({
          ...household,
          members: members.map(m => m.id)
        });
      }
      
      else if (type === 'citizen') {
        let citizen = citizenService.engine.getCitizen(id);
        if (!citizen) {
          const dbCit = await prisma.citizen.findUnique({ where: { id } });
          if (!dbCit) return reply.status(404).send({ error: 'Citizen not found' });
          citizen = dbCit as any;
        }
        
        const time = timeService.engine.getCurrentTime();
        const exactCoords = spatialService.engine.queryService.resolveCitizenLocation(citizen!, time);
        
        const wallet = citizen!.wallet;
        
        return reply.send({
          ...citizen,
          x: exactCoords?.x ?? citizen!.coordX,
          y: exactCoords?.y ?? citizen!.coordY,
          wallet: wallet ? { balance: wallet.balance } : null
        });
      }
      
      else if (type === 'resource') {
        const resource = resourceService.engine.resourceManager.getAllResources().find(r => r.id === id);
        if (!resource) return reply.status(404).send({ error: 'Resource not found' });
        return reply.send(resource);
      }
      
      return reply.status(400).send({ error: 'Invalid entity type' });
      
    } catch (e: any) {
      console.error(e);
      return reply.status(500).send({ error: 'Internal Server Error' });
    } finally {
      await prisma.$disconnect();
    }
  },
  
  searchEntities: async (request: FastifyRequest<{ Querystring: { q: string } }>, reply: FastifyReply) => {
    const q = request.query.q?.toLowerCase() || '';
    if (q.length < 2) return reply.send({ results: [] });
    
    const results: any[] = [];
    const prisma = new PrismaClient();
    
    try {
      // 1. Citizens
      const citizens = await prisma.citizen.findMany({
        where: { OR: [ { id: { contains: q } }, { name: { contains: q } } ] },
        take: 5
      });
      citizens.forEach(c => results.push({ type: 'citizen', id: c.id, name: c.name || c.id }));

      // 2. Workplaces
      const workplaces = worldService.engine.workplaceRepository.findAll().filter(w => w.id.toLowerCase().includes(q) || w.type.toLowerCase().includes(q)).slice(0, 5);
      workplaces.forEach(w => results.push({ type: 'workplace', id: w.id, name: w.type || w.id }));

      // 3. Buildings
      const buildings = await prisma.building.findMany({
        where: { OR: [ { id: { contains: q } }, { name: { contains: q } } ] },
        take: 5
      });
      buildings.forEach(b => results.push({ type: 'building', id: b.id, name: b.name || b.id }));

      // 4. Cities
      const cities = worldService.engine.cityManager.getAllCities().filter(c => c.id.toLowerCase().includes(q) || c.name.toLowerCase().includes(q)).slice(0, 5);
      cities.forEach(c => results.push({ type: 'city', id: c.id, name: c.name }));

      // 5. Districts
      const districts = worldService.engine.districtManager.getAllDistricts().filter(d => d.id.toLowerCase().includes(q) || d.name.toLowerCase().includes(q)).slice(0, 5);
      districts.forEach(d => results.push({ type: 'district', id: d.id, name: d.name }));

      // 6. Households
      const households = await prisma.household.findMany({
        where: { id: { contains: q } },
        take: 5
      });
      households.forEach(h => results.push({ type: 'household', id: h.id, name: h.id }));
      
      // 7. Regions
      const regions = worldService.engine.regionManager.getAllRegions().filter(r => r.id.toLowerCase().includes(q) || r.name.toLowerCase().includes(q)).slice(0, 5);
      regions.forEach(r => results.push({ type: 'region', id: r.id, name: r.name }));

      return reply.send({ results });
      
    } catch (e: any) {
      console.error(e);
      return reply.status(500).send({ error: 'Internal Server Error' });
    } finally {
      await prisma.$disconnect();
    }
  },
  
  getHierarchyPath: async (request: FastifyRequest<{ Params: { type: string, id: string } }>, reply: FastifyReply) => {
    const { type, id } = request.params;
    const path: { type: string, id: string, name: string }[] = [];
    
    const prisma = new PrismaClient();
    try {
      let currentType = type;
      let currentId = id;
      
      while (currentType && currentId) {
        if (currentType === 'citizen') {
          const c = await prisma.citizen.findUnique({ where: { id: currentId } });
          if (!c) break;
          path.unshift({ type: 'citizen', id: currentId, name: c.name || currentId });
          
          if (c.householdId) {
            currentType = 'household';
            currentId = c.householdId;
          } else {
            break;
          }
        } 
        else if (currentType === 'household') {
          const h = await prisma.household.findUnique({ where: { id: currentId } });
          if (!h) break;
          path.unshift({ type: 'household', id: currentId, name: currentId });
          
          if (h.locationId) {
            currentType = 'building';
            currentId = h.locationId;
          } else {
            break;
          }
        }
        else if (currentType === 'workplace') {
          const w = worldService.engine.workplaceRepository.findById(currentId);
          if (!w) break;
          path.unshift({ type: 'workplace', id: currentId, name: w.type || currentId });
          
          if (w.locationId) {
            currentType = 'building';
            currentId = w.locationId;
          } else if (w.regionId) {
            currentType = 'region';
            currentId = w.regionId;
          } else {
            break;
          }
        }
        else if (currentType === 'building') {
          const b = await prisma.building.findUnique({ where: { id: currentId } });
          if (!b) break;
          path.unshift({ type: 'building', id: currentId, name: b.name || currentId });
          
          if (b.districtId) {
            currentType = 'district';
            currentId = b.districtId;
          } else {
            break;
          }
        }
        else if (currentType === 'district') {
          const d = worldService.engine.districtManager.getDistrict(currentId);
          if (!d) break;
          path.unshift({ type: 'district', id: currentId, name: d.name });
          
          if (d.cityId) {
            currentType = 'city';
            currentId = d.cityId;
          } else {
            break;
          }
        }
        else if (currentType === 'city') {
          const c = worldService.engine.cityManager.getCity(currentId);
          if (!c) break;
          path.unshift({ type: 'city', id: currentId, name: c.name });
          
          if (c.regionId) {
            currentType = 'region';
            currentId = c.regionId;
          } else {
            break;
          }
        }
        else if (currentType === 'region') {
          const r = worldService.engine.regionManager.getRegion(currentId);
          if (!r) break;
          path.unshift({ type: 'region', id: currentId, name: r.name });
          break; // Stop at region
        }
        else if (currentType === 'resource') {
          const { resourceService } = await import('../services/resource.service');
          const r = resourceService.engine.resourceManager.getAllResources().find(res => res.id === currentId);
          if (!r) break;
          path.unshift({ type: 'resource', id: currentId, name: r.type || currentId });
          
          if (r.regionId) {
             currentType = 'region';
             currentId = r.regionId;
          } else {
             break;
          }
        }
        else {
          break;
        }
      }
      
      return reply.send({ path });
    } catch (e) {
      console.error(e);
      return reply.status(500).send({ error: 'Internal Server Error' });
    } finally {
      await prisma.$disconnect();
    }
  }
};
