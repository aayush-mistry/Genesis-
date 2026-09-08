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

  /**
   * Checks if two spatial bounds overlap.
   */
  public static checkOverlap(boundsA: import('@genesis/shared').SpatialBounds, boundsB: import('@genesis/shared').SpatialBounds): boolean {
    return (
      boundsA.x < boundsB.x + boundsB.width &&
      boundsA.x + boundsA.width > boundsB.x &&
      boundsA.y < boundsB.y + boundsB.height &&
      boundsA.y + boundsA.height > boundsB.y
    );
  }

  /**
   * Checks if child bounds are completely inside parent bounds.
   */
  public static isInside(child: import('@genesis/shared').SpatialBounds, parent: import('@genesis/shared').SpatialBounds): boolean {
    return (
      child.x >= parent.x &&
      child.y >= parent.y &&
      child.x + child.width <= parent.x + parent.width &&
      child.y + child.height <= parent.y + parent.height
    );
  }
}
