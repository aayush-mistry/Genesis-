import { SpatialCalculator } from '../SpatialCalculator';
import { GridSpatialIndex } from '../GridSpatialIndex';
import { SpatialEntity } from '@genesis/shared';
import { SpatialQueryService } from '../SpatialQueryService';
import { WorldEngine } from '../../world/WorldEngine';
import { SpatialEngine } from '../SpatialEngine';
import { EventScheduler } from '../../events/EventScheduler';
import { TimeEngine } from '../../time/TimeEngine';

describe('Spatial Engine', () => {
  describe('SpatialCalculator', () => {
    it('calculates distance correctly', () => {
      const dist = SpatialCalculator.calculateDistance({ x: 0, y: 0 }, { x: 3, y: 4 });
      expect(dist).toBe(5);
    });
  });

  describe('GridSpatialIndex', () => {
    let index: GridSpatialIndex;

    beforeEach(() => {
      index = new GridSpatialIndex(100);
    });

    it('inserts and retrieves entities', () => {
      const e1: SpatialEntity = { id: '1', type: 'BUILDING', position: { x: 50, y: 50 } };
      index.insert(e1);
      
      const stats = index.getStatistics();
      expect(stats.indexedEntities).toBe(1);
      
      const results = index.queryRadius({ x: 50, y: 50 }, 10);
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('1');
    });

    it('updates entity position', () => {
      const e1: SpatialEntity = { id: '1', type: 'BUILDING', position: { x: 50, y: 50 } };
      index.insert(e1);
      
      e1.position = { x: 150, y: 150 };
      index.update(e1);
      
      const oldCellQuery = index.queryRadius({ x: 50, y: 50 }, 10);
      expect(oldCellQuery).toHaveLength(0);
      
      const newCellQuery = index.queryRadius({ x: 150, y: 150 }, 10);
      expect(newCellQuery).toHaveLength(1);
    });

    it('removes entity', () => {
      const e1: SpatialEntity = { id: '1', type: 'BUILDING', position: { x: 50, y: 50 } };
      index.insert(e1);
      index.remove('1');
      
      const results = index.queryRadius({ x: 50, y: 50 }, 10);
      expect(results).toHaveLength(0);
      expect(index.getStatistics().indexedEntities).toBe(0);
    });
  });

  describe('SpatialQueryService', () => {
    let index: GridSpatialIndex;
    let queryService: SpatialQueryService;
    let worldEngine: WorldEngine;

    beforeEach(() => {
      index = new GridSpatialIndex(100);
      worldEngine = new WorldEngine();
      queryService = new SpatialQueryService(index, worldEngine);
    });

    it('finds nearby entities filtered by type and limited', () => {
      index.insert({ id: '1', type: 'HOUSE', position: { x: 10, y: 10 } });
      index.insert({ id: '2', type: 'HOUSE', position: { x: 20, y: 20 } });
      index.insert({ id: '3', type: 'OFFICE', position: { x: 15, y: 15 } });
      
      const results = queryService.findNearby({ x: 0, y: 0 }, 50, { type: 'HOUSE' });
      expect(results).toHaveLength(2);
      expect(results[0].id).toBe('1'); // Closer
      expect(results[1].id).toBe('2');
    });

    it('finds nearest entity', () => {
      index.insert({ id: '1', type: 'HOUSE', position: { x: 100, y: 100 } });
      index.insert({ id: '2', type: 'HOUSE', position: { x: 50, y: 50 } });
      
      const nearest = queryService.findNearest({ x: 0, y: 0 });
      expect(nearest).not.toBeNull();
      expect(nearest!.id).toBe('2');
    });
    
    it('returns null if empty', () => {
      const nearest = queryService.findNearest({ x: 0, y: 0 });
      expect(nearest).toBeNull();
    });
  });

  describe('SpatialEngine', () => {
    it('initializes from WorldEngine', () => {
      const worldEngine = new WorldEngine();
      const region = worldEngine.regionManager.createRegion({
        name: 'TestRegion',
        description: 'Test',
        climate: 'Test',
        population: 0,
        coordinates: { x: 0, y: 0 },
        worldId: 'world-1',
        createdAt: new Date(),
        updatedAt: new Date()
      });

      const city = worldEngine.cityManager.createCity({
        name: 'TestCity',
        population: 100,
        coordinates: { x: 10, y: 10 },
        area: 100,
        regionId: region.id,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      worldEngine.regionManager.addCity(region.id, city.id);

      const timeEngine = new TimeEngine();
      const scheduler = new EventScheduler(timeEngine);
      const spatialEngine = new SpatialEngine(worldEngine, scheduler);
      
      spatialEngine.initialize();
      
      const stats = spatialEngine.index.getStatistics();
      expect(stats.indexedEntities).toBeGreaterThan(0);
    });
  });
});
