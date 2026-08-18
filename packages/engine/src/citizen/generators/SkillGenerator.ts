import { Skill, SkillType } from '@genesis/shared';
import { SeededRandom } from '../../utils/SeededRandom';

export class SkillGenerator {
  /**
   * Generates a base skill profile for a citizen deterministically.
   * @param seed The deterministic seed, usually derived from the citizen ID.
   * @param age The citizen's age, which might slightly scale initial skill pools.
   */
  public static generateSkills(seed: number, age: number): Skill[] {
    const random = new SeededRandom(seed);
    const skills: Skill[] = [];

    // Scale total skill points based on age, up to a certain point
    // An adult (18+) has higher initial potential than a child
    let basePotential = 100;
    if (age > 18) {
      basePotential += Math.min(age - 18, 20) * 5; // e.g., age 38 gets +100
    }

    const allTypes = Object.values(SkillType);

    for (const type of allTypes) {
      // Base generation: between 0 and 20 for everyone
      let level = random.nextInt(0, 20);

      // Randomly, a citizen might have a natural "talent" for a few skills
      if (random.nextFloat(0, 1) > 0.8) {
        level += random.nextInt(10, 40);
      }

      // Add experience scaling based on age (simulating they lived and learned)
      if (age >= 18) {
         // Cap the random addition so we don't exceed 100 easily
         const extra = random.nextInt(0, Math.floor(basePotential / allTypes.length));
         level += extra;
      }

      // Ensure min 0, max 100
      level = Math.max(0, Math.min(100, level));

      skills.push({
        type,
        level,
        experience: 0
      });
    }

    return skills;
  }
}
