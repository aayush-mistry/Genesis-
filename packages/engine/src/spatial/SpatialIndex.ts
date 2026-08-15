import { SpatialEntity, Coordinate } from '@genesis/shared';

export interface SpatialIndex {
  insert(entity: SpatialEntity): void;
  update(entity: SpatialEntity): void;
  remove(entityId: string): void;
  queryRadius(center: Coordinate, radius: number): SpatialEntity[];
  queryBounds(minX: number, minY: number, maxX: number, maxY: number): SpatialEntity[];
  clear(): void;
  getStatistics(): { indexedEntities: number; gridCells: number; entitiesPerCellAvg: number };
}
