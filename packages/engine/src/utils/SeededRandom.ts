/**
 * A simple deterministic PRNG (Pseudo-Random Number Generator)
 * using a Linear Congruential Generator (LCG) algorithm.
 * This guarantees that the same seed will produce the exact same sequence of numbers.
 */
export class SeededRandom {
  private seed: number;

  constructor(seed: number) {
    this.seed = seed % 2147483647;
    if (this.seed <= 0) {
      this.seed += 2147483646;
    }
  }

  /**
   * Returns a pseudo-random number between 0 (inclusive) and 1 (exclusive).
   */
  public next(): number {
    this.seed = (this.seed * 16807) % 2147483647;
    return (this.seed - 1) / 2147483646;
  }

  /**
   * Returns a pseudo-random integer between min (inclusive) and max (inclusive).
   */
  public nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  /**
   * Returns a pseudo-random number between min (inclusive) and max (exclusive).
   */
  public nextFloat(min: number, max: number): number {
    return this.next() * (max - min) + min;
  }
}
