import { SpatialEntity, Coordinate } from '@genesis/shared';
import { SpatialIndex } from './SpatialIndex';
import { SpatialCalculator } from './SpatialCalculator';

export class GridSpatialIndex implements SpatialIndex {
  private cellSize: number;
  private grid: Map<string, Map<string, SpatialEntity>>; // cellKey -> (entityId -> entity)
  private entityToCell: Map<string, string>; // entityId -> cellKey

  constructor(cellSize: number = 100) {
    this.cellSize = cellSize;
    this.grid = new Map();
    this.entityToCell = new Map();
  }

  private getCellKey(coord: Coordinate): string {
    const x = Math.floor(coord.x / this.cellSize);
    const y = Math.floor(coord.y / this.cellSize);
    return `${x},${y}`;
  }

  public insert(entity: SpatialEntity): void {
    const cellKey = this.getCellKey(entity.position);
    this.entityToCell.set(entity.id, cellKey);
    
    if (!this.grid.has(cellKey)) {
      this.grid.set(cellKey, new Map());
    }
    
    this.grid.get(cellKey)!.set(entity.id, entity);
  }

  public update(entity: SpatialEntity): void {
    const oldCellKey = this.entityToCell.get(entity.id);
    const newCellKey = this.getCellKey(entity.position);

    if (oldCellKey && oldCellKey !== newCellKey) {
      // Cell changed, move it
      const oldCell = this.grid.get(oldCellKey);
      if (oldCell) {
        oldCell.delete(entity.id);
        if (oldCell.size === 0) {
          this.grid.delete(oldCellKey);
        }
      }
    }

    this.insert(entity);
  }

  public remove(entityId: string): void {
    const cellKey = this.entityToCell.get(entityId);
    if (cellKey) {
      const cell = this.grid.get(cellKey);
      if (cell) {
        cell.delete(entityId);
        if (cell.size === 0) {
          this.grid.delete(cellKey);
        }
      }
      this.entityToCell.delete(entityId);
    }
  }

  public queryRadius(center: Coordinate, radius: number): SpatialEntity[] {
    const results: SpatialEntity[] = [];
    
    const minX = center.x - radius;
    const maxX = center.x + radius;
    const minY = center.y - radius;
    const maxY = center.y + radius;

    const startGridX = Math.floor(minX / this.cellSize);
    const endGridX = Math.floor(maxX / this.cellSize);
    const startGridY = Math.floor(minY / this.cellSize);
    const endGridY = Math.floor(maxY / this.cellSize);

    const radiusSq = radius * radius;

    for (let x = startGridX; x <= endGridX; x++) {
      for (let y = startGridY; y <= endGridY; y++) {
        const cellKey = `${x},${y}`;
        const cell = this.grid.get(cellKey);
        if (cell) {
          for (const entity of cell.values()) {
            // Precise distance check
            const dx = entity.position.x - center.x;
            const dy = entity.position.y - center.y;
            if (dx * dx + dy * dy <= radiusSq) {
              results.push(entity);
            }
          }
        }
      }
    }

    return results;
  }

  public queryBounds(minX: number, minY: number, maxX: number, maxY: number): SpatialEntity[] {
    const results: SpatialEntity[] = [];

    const startGridX = Math.floor(minX / this.cellSize);
    const endGridX = Math.floor(maxX / this.cellSize);
    const startGridY = Math.floor(minY / this.cellSize);
    const endGridY = Math.floor(maxY / this.cellSize);

    for (let x = startGridX; x <= endGridX; x++) {
      for (let y = startGridY; y <= endGridY; y++) {
        const cellKey = `${x},${y}`;
        const cell = this.grid.get(cellKey);
        if (cell) {
          for (const entity of cell.values()) {
            if (
              entity.position.x >= minX &&
              entity.position.x <= maxX &&
              entity.position.y >= minY &&
              entity.position.y <= maxY
            ) {
              results.push(entity);
            }
          }
        }
      }
    }

    return results;
  }

  public clear(): void {
    this.grid.clear();
    this.entityToCell.clear();
  }

  public getStatistics(): { indexedEntities: number; gridCells: number; entitiesPerCellAvg: number } {
    const gridCells = this.grid.size;
    const indexedEntities = this.entityToCell.size;
    const entitiesPerCellAvg = gridCells > 0 ? Number((indexedEntities / gridCells).toFixed(2)) : 0;
    
    return {
      indexedEntities,
      gridCells,
      entitiesPerCellAvg
    };
  }
}
