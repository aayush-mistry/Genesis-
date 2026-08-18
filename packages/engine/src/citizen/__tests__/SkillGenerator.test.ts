import { SkillGenerator } from '../generators/SkillGenerator';
import { CitizenGender, CitizenStatus, MovementState } from '@genesis/shared';
import { AgeCalculator } from '../services/AgeCalculator';

describe('SkillGenerator', () => {
  it('TEST 6: Skills are deterministic', () => {
    const skills1 = SkillGenerator.generateSkills(12345, 25);
    const skills2 = SkillGenerator.generateSkills(12345, 25);
    expect(skills1).toEqual(skills2);
  });

  it('TEST 7: Same seed produces same skill profile', () => {
    const skills1 = SkillGenerator.generateSkills(999, 40);
    const skills2 = SkillGenerator.generateSkills(999, 40);
    expect(skills1).toEqual(skills2);
    expect(skills1.length).toBeGreaterThan(0);
  });

  it('Produces different profiles for different seeds', () => {
    const skills1 = SkillGenerator.generateSkills(111, 25);
    const skills2 = SkillGenerator.generateSkills(222, 25);
    expect(skills1).not.toEqual(skills2);
  });
});
