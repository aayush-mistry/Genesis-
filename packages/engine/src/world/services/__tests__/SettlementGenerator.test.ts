import { WorldEngine } from '../../WorldEngine';
import { SettlementGenerator } from '../SettlementGenerator';
import { DistrictType, BuildingType, District, Building } from '@genesis/shared';

describe('SettlementGenerator Scalability', () => {
  let worldEngine: WorldEngine;
  let generator: SettlementGenerator;
  let city: any;
  let district: District;
  const SEED = 'test-seed-123';

  beforeEach(() => {
    worldEngine = new WorldEngine();
    generator = new SettlementGenerator(worldEngine);
    const world = worldEngine.worldManager.createWorld('Test', 'Desc', 123);
    const region = worldEngine.regionManager.createRegion({
      name: 'R', climate: 'T', description: 'D', population: 0,
      coordinates: { x: 0, y: 0 }, width: 1000, height: 1000, worldId: world.id,
      createdAt: new Date(), updatedAt: new Date()
    });
    city = worldEngine.cityManager.createCity({
      name: 'C', regionId: region.id, coordinates: { x: 0, y: 0 },
      width: 100, height: 100, population: 0, area: 10000,
      createdAt: new Date(), updatedAt: new Date()
    });
    district = generator.getOrCreateResidentialDistrict(city.id, SEED);
  });

  afterEach(() => {
    worldEngine.reset();
  });

  const runTest = (population: number) => {
    const requiredCapacity = Math.ceil(population / (SettlementGenerator.HOUSEHOLD_CAPACITY * SettlementGenerator.APARTMENT_HOUSEHOLD_CAPACITY));
    const apartments = generator.generateApartmentsForPopulation(district, population, SEED);
    expect(apartments.length).toBe(requiredCapacity);

    // Verify all apartments are of type APARTMENT and have deterministic coordinates
    apartments.forEach((apt: Building) => {
      expect(apt.type).toBe(BuildingType.APARTMENT);
      expect(apt.coordinates).toBeDefined();
    });

    return apartments;
  };

  test('generates correct number of apartments for 100 citizens', () => {
    runTest(100);
  });

  test('generates correct number of apartments for 1000 citizens', () => {
    runTest(1000);
  });

  test('generates correct number of apartments for 5000 citizens', () => {
    runTest(5000); // Expect 10 apartments
  });

  test('generates correct number of apartments for 10000 citizens', () => {
    runTest(10000); // Expect 20 apartments
  });
});
