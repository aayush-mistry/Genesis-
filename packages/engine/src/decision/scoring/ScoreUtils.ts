export class ScoreUtils {
  /**
   * Clamps a given score between the minimum (0) and maximum (100) allowed values.
   */
  public static clampScore(score: number): number {
    return Math.max(0, Math.min(100, score));
  }

  /**
   * Normalizes a value from a given range to the 0-100 score range.
   */
  public static normalizeToScore(value: number, min: number, max: number): number {
    if (min === max) {
      return 50; // Neutral default if range is 0
    }
    const normalized = ((value - min) / (max - min)) * 100;
    return ScoreUtils.clampScore(normalized);
  }
}
