import { Coordinate } from './world';
import { BaseEntity } from './common';

export interface SpatialPosition {
  x: number;
  y: number;
}

export interface SpatialSize {
  width: number;
  height: number;
}

export interface SpatialBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SpatialEntity {
  id: string;
  type: string;
  position: Coordinate;
  regionId?: string;
  metadata?: Record<string, unknown>;
}

export enum SpatialRelationship {
  NEAR = 'NEAR',
  FAR = 'FAR',
  SAME_REGION = 'SAME_REGION',
  ADJACENT_REGION = 'ADJACENT_REGION',
}

export interface SpatialIndexConfig {
  cellSize: number;
}

export interface SpatialStatistics {
  indexedEntities: number;
  gridCells: number;
  entitiesPerCellAvg: number;
  queryCount: number;
  indexStatus: string;
}

export interface SpatialQueryOptions {
  limit?: number;
  type?: string;
}
