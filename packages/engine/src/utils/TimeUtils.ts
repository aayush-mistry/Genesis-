import { SimulationTime } from '../time/SimulationTime';

export class TimeUtils {
  // Constants for conversion
  private static readonly SECONDS_PER_MINUTE = 60;
  private static readonly SECONDS_PER_HOUR = 60 * 60;
  private static readonly SECONDS_PER_DAY = 24 * 60 * 60;
  private static readonly SECONDS_PER_MONTH = 30 * 24 * 60 * 60;
  private static readonly SECONDS_PER_YEAR = 12 * 30 * 24 * 60 * 60;

  /**
   * Converts a SimulationTime object into an absolute number of seconds.
   * This provides a scalar value that is perfect for sorting and comparing times.
   * Based on Year 1, Month 1, Day 1, 00:00:00 = 0 seconds.
   */
  public static toSeconds(time: SimulationTime): number {
    let totalSeconds = 0;

    // Years, Months, and Days are 1-indexed in SimulationTime, so we subtract 1.
    totalSeconds += (time.year - 1) * this.SECONDS_PER_YEAR;
    totalSeconds += (time.month - 1) * this.SECONDS_PER_MONTH;
    totalSeconds += (time.day - 1) * this.SECONDS_PER_DAY;
    
    // Hours, Minutes, Seconds are 0-indexed.
    totalSeconds += time.hour * this.SECONDS_PER_HOUR;
    totalSeconds += time.minute * this.SECONDS_PER_MINUTE;
    totalSeconds += time.second;

    return totalSeconds;
  }

  /**
   * Converts a scalar number of seconds back into a SimulationTime object.
   */
  public static fromSeconds(totalSeconds: number): SimulationTime {
    let remaining = totalSeconds;

    const second = remaining % 60;
    remaining = Math.floor(remaining / 60);

    const minute = remaining % 60;
    remaining = Math.floor(remaining / 60);

    const hour = remaining % 24;
    remaining = Math.floor(remaining / 24);

    const day = (remaining % 30) + 1;
    remaining = Math.floor(remaining / 30);

    const month = (remaining % 12) + 1;
    const year = Math.floor(remaining / 12) + 1;

    return { year, month, day, hour, minute, second };
  }

  /**
   * Compare two SimulationTime objects.
   * Returns negative if t1 < t2, zero if t1 === t2, positive if t1 > t2
   */
  public static compare(t1: SimulationTime, t2: SimulationTime): number {
    return this.toSeconds(t1) - this.toSeconds(t2);
  }

  /**
   * Deep copies a SimulationTime object.
   */
  public static clone(time: SimulationTime): SimulationTime {
    return { ...time };
  }
}
