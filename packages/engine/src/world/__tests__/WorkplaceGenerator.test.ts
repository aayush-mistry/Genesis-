import { WorkplaceGenerator } from '../services/WorkplaceGenerator';
import { WorldEngine } from '../WorldEngine';
import { WorkplaceType } from '@genesis/shared';
import { WorkplaceRepository } from '../repositories/WorkplaceRepository';

describe('WorkplaceGenerator', () => {
  let worldEngine: WorldEngine;
  let workplaceRepo: WorkplaceRepository;
  let generator: WorkplaceGenerator;

  beforeEach(() => {
    worldEngine = new WorldEngine();
    workplaceRepo = worldEngine.workplaceRepository;
    generator = new WorkplaceGenerator(worldEngine, workplaceRepo);
  });

  it('TEST 14 & 15 & 16 & 17: Generates workplaces based on world state', () => {
    // Setup a fake world
    const region1 = worldEngine.regionManager.createRegion({ name: 'R1', description: '', population: 0, worldId: 'w1', coordinates: { x:0, y:0 }, climate: 'Temperate', createdAt: new Date(), updatedAt: new Date() });
    worldEngine.worldManager.addRegion(region1.id);

    const city1 = worldEngine.cityManager.createCity({ name: 'C1', population: 0, coordinates: { x:0, y:0 }, area: 100, regionId: region1.id, createdAt: new Date(), updatedAt: new Date() });
    worldEngine.regionManager.addCity(region1.id, city1.id);

    const district1 = worldEngine.districtManager.createDistrict({ name: 'D1', type: 'COMMERCIAL' as any, cityId: city1.id, createdAt: new Date(), updatedAt: new Date() });
    worldEngine.cityManager.addDistrict(city1.id, district1.id);

    const building1 = worldEngine.buildingManager.createBuilding({ name: 'B1', type: 'OFFICE' as any, coordinates: { x:0, y:0 }, capacity: 10, status: 'OK', districtId: district1.id, createdAt: new Date(), updatedAt: new Date() });
    worldEngine.districtManager.addBuilding(district1.id, building1.id);

    // Generate
    generator.generateWorkplaces();

    const workplaces = workplaceRepo.findAll();

    // Expect essential services to be generated (2x Hospital, 2x School, 2x Police, 2x Fire = 8)
    // Plus 1 Farm (Temperate region)
    // Plus 1 Office (from the building)
    
    expect(workplaces.some(w => w.type === WorkplaceType.HOSPITAL)).toBe(true);
    expect(workplaces.some(w => w.type === WorkplaceType.SCHOOL)).toBe(true);
    expect(workplaces.some(w => w.type === WorkplaceType.POLICE_STATION)).toBe(true);
    expect(workplaces.some(w => w.type === WorkplaceType.FIRE_STATION)).toBe(true);
    
    expect(workplaces.some(w => w.type === WorkplaceType.FARM)).toBe(true);
    expect(workplaces.some(w => w.type === WorkplaceType.OFFICE)).toBe(true);

    const office = workplaces.find(w => w.type === WorkplaceType.OFFICE);
    expect(office!.capacity).toBe(8); // 80% of building capacity 10
  });
});
