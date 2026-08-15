import { SimulationTime } from '@genesis/shared';

export class AgeCalculator {
  /**
   * Calculates the age deterministically based on simulation time.
   * Does NOT use Date.now().
   */
  public static calculateAge(birthDate: SimulationTime, currentDate: SimulationTime): number {
    let age = currentDate.year - birthDate.year;

    // Adjust age if the current month/day is before the birth month/day
    if (
      currentDate.month < birthDate.month ||
      (currentDate.month === birthDate.month && currentDate.day < birthDate.day)
    ) {
      age--;
    }

    // Age shouldn't realistically be negative if the simulation time is properly progressing.
    // If it is, cap it at 0.
    return Math.max(0, age);
  }
}
