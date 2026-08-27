import { CitizenService } from '../services/CitizenService';
import { InMemoryCitizenRepository } from '../repositories/InMemoryCitizenRepository';
import { AgeCalculator } from '../services/AgeCalculator';
import { NameGenerator } from '../generators/NameGenerator';
import { TimeEngine } from '../../time/TimeEngine';
import { WorldEngine } from '../../world/WorldEngine';
import { EventScheduler } from '../../events/EventScheduler';
import { CitizenGender, CitizenStatus, SimulationTime } from '@genesis/shared';

describe('Citizen Engine (Phase 3.1)', () => {
  let timeEngine: TimeEngine;
  let worldEngine: WorldEngine;
  let scheduler: EventScheduler;
  let spatialEngine: import('../../spatial/SpatialEngine').SpatialEngine;
  let repository: InMemoryCitizenRepository;
  let citizenService: CitizenService;

  beforeEach(() => {
    timeEngine = new TimeEngine();
    scheduler = new EventScheduler(timeEngine);
    worldEngine = new WorldEngine();
    spatialEngine = new (require('../../spatial/SpatialEngine').SpatialEngine)(worldEngine, scheduler);
    repository = new InMemoryCitizenRepository();
    citizenService = new CitizenService(repository, worldEngine, timeEngine, scheduler, spatialEngine.queryService, new (require('../../citizen/services/HouseholdService').HouseholdService)(new (require('../../inventory/InventoryManager').InventoryManager)()));
  });

  describe('Citizen Creation & Retrieval', () => {
    it('creates a citizen successfully', () => {
      const citizen = citizenService.createCitizen(CitizenGender.MALE);
      expect(citizen.id).toMatch(/^citizen-\d{6}$/);
      expect(citizen.gender).toBe(CitizenGender.MALE);
      expect(citizen.status).toBe(CitizenStatus.ACTIVE);
      expect(citizen.name).toBeDefined();
      expect(citizen.locationId).toBeNull();
    });

    it('can retrieve a created citizen', () => {
      const created = citizenService.createCitizen(CitizenGender.FEMALE);
      const retrieved = citizenService.getCitizen(created.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(created.id);
    });

    it('lists all citizens', () => {
      citizenService.createCitizen(CitizenGender.MALE);
      citizenService.createCitizen(CitizenGender.FEMALE);
      expect(citizenService.listCitizens().length).toBe(2);
    });

    it('can remove a citizen', () => {
      const citizen = citizenService.createCitizen(CitizenGender.MALE);
      expect(citizenService.getCitizen(citizen.id)).toBeDefined();
      
      const deleted = citizenService.deleteCitizen(citizen.id);
      expect(deleted).toBe(true);
      expect(citizenService.getCitizen(citizen.id)).toBeUndefined();
    });
  });

  describe('World Integration & Location Validation', () => {
    it('throws error if locationId does not exist in WorldEngine', () => {
      expect(() => {
        citizenService.createCitizen(CitizenGender.MALE, 'fake-building-123');
      }).toThrow(/does not exist in the World Engine/);
    });

    it('accepts a valid locationId from WorldEngine', () => {
      const region = worldEngine.regionManager.createRegion({ name: 'Test Region', description: 'desc', population: 0, worldId: 'world-1', coordinates: { x: 0, y: 0 }, climate: 'Temperate', createdAt: new Date(), updatedAt: new Date() });
      worldEngine.worldManager.addRegion(region.id);

      const citizen = citizenService.createCitizen(CitizenGender.FEMALE, region.id);
      expect(citizen.locationId).toBe(region.id);
    });
  });

  describe('Time Integration & Age Calculation', () => {
    it('calculates age correctly across years', () => {
      const birth: SimulationTime = { year: 10, month: 5, day: 15, hour: 0, minute: 0, second: 0 };
      const current: SimulationTime = { year: 25, month: 6, day: 1, hour: 0, minute: 0, second: 0 };
      expect(AgeCalculator.calculateAge(birth, current)).toBe(15);
    });

    it('handles age exactly on the birthday', () => {
      const birth: SimulationTime = { year: 10, month: 5, day: 15, hour: 0, minute: 0, second: 0 };
      const current: SimulationTime = { year: 25, month: 5, day: 15, hour: 0, minute: 0, second: 0 };
      expect(AgeCalculator.calculateAge(birth, current)).toBe(15);
    });

    it('subtracts 1 year if current date is before birthday in the current year', () => {
      const birth: SimulationTime = { year: 10, month: 5, day: 15, hour: 0, minute: 0, second: 0 };
      const current: SimulationTime = { year: 25, month: 5, day: 14, hour: 0, minute: 0, second: 0 };
      expect(AgeCalculator.calculateAge(birth, current)).toBe(14);
    });

    it('uses timeEngine for simulation age dynamically', () => {
      // timeEngine starts at year 1
      const citizen = citizenService.createCitizen(CitizenGender.OTHER);
      expect(citizenService.getCitizenAge(citizen)).toBe(0);

      // Advance time by 10 years (assuming standard 12 month/30 day calendar from TimeEngine)
      for (let i = 0; i < 10 * 12 * 30 * 24 * 60 * 60; i += 60*60*24*30) {
        // Just cheat the internal state for test
      }
      
      // Let's explicitly set TimeEngine's internal time using a mock if we want, or test AgeCalculator separately.
      const current = timeEngine.getCurrentTime();
      current.year += 10; 
      
      jest.spyOn(timeEngine, 'getCurrentTime').mockReturnValue(current);
      expect(citizenService.getCitizenAge(citizen)).toBe(10);
    });
  });

  describe('Deterministic Identity', () => {
    it('generates the same name for the same seed and gender', () => {
      const name1 = NameGenerator.generateName(12345, CitizenGender.FEMALE);
      const name2 = NameGenerator.generateName(12345, CitizenGender.FEMALE);
      expect(name1).toEqual(name2);
    });

    it('generates different names for different seeds', () => {
      const name1 = NameGenerator.generateName(12345, CitizenGender.MALE);
      const name2 = NameGenerator.generateName(54321, CitizenGender.MALE);
      expect(name1).not.toEqual(name2);
    });

    it('uses no Math.random() under the hood', () => {
      const spy = jest.spyOn(Math, 'random');
      NameGenerator.generateName(999, CitizenGender.OTHER);
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });
  });
});

