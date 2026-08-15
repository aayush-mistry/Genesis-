import { Coordinate } from '@genesis/shared';

export class SpatialCalculator {
  /**
   * Calculates the exact Euclidean distance between two coordinates.
   */
  public static calculateDistance(coord1: Coordinate, coord2: Coordinate): number {
    const dx = coord2.x - coord1.x;
    const dy = coord2.y - coord1.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Fast squared distance check to avoid square root for performance.
   */
  public static calculateDistanceSquared(coord1: Coordinate, coord2: Coordinate): number {
    const dx = coord2.x - coord1.x;
    const dy = coord2.y - coord1.y;
    return dx * dx + dy * dy;
  }
}
