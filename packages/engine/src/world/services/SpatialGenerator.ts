import { Coordinate, SpatialBounds, Building } from '@genesis/shared';
import { SpatialCalculator } from '../../spatial/SpatialCalculator';

export class SpatialGenerator {
  /**
   * Simple deterministic random number generator based on a string seed.
   */
  private static getSeededRandom(seed: string): () => number {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      hash = Math.imul(31, hash) + seed.charCodeAt(i) | 0;
    }
    let state = hash;
    return function() {
      state = Math.imul(1597334677, state) + 1 | 0;
      let t = Math.imul((state ^ (state >>> 16)), 116282283);
      state = t ^ (t >>> 13);
      return (state >>> 0) / 4294967296;
    };
  }

  /**
   * Generates a non-overlapping bounds inside a parent.
   */
  public static generateNonOverlappingBounds(
    parentBounds: SpatialBounds,
    requiredWidth: number,
    requiredHeight: number,
    existingSiblings: SpatialBounds[],
    seed: string,
    maxAttempts: number = 100
  ): SpatialBounds | null {
    const rng = this.getSeededRandom(seed);

    for (let i = 0; i < maxAttempts; i++) {
      const candidateX = parentBounds.x + (rng() * (parentBounds.width - requiredWidth));
      const candidateY = parentBounds.y + (rng() * (parentBounds.height - requiredHeight));

      const candidateBounds: SpatialBounds = {
        x: candidateX,
        y: candidateY,
        width: requiredWidth,
        height: requiredHeight
      };

      if (!SpatialCalculator.isInside(candidateBounds, parentBounds)) continue;

      let overlaps = false;
      for (const sibling of existingSiblings) {
        if (SpatialCalculator.checkOverlap(candidateBounds, sibling)) {
          overlaps = true;
          break;
        }
      }

      if (!overlaps) {
        return candidateBounds;
      }
    }

    return null;
  }
}
