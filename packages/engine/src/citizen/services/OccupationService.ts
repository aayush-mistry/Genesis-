import { Citizen, EmploymentStatus, JobPosition, JobType, SkillType, Workplace } from '@genesis/shared';
import { CitizenService } from './CitizenService';
import { WorkplaceRepository } from '../../world/repositories/WorkplaceRepository';

export class OccupationService {
  constructor(
    private citizenService: CitizenService,
    private workplaceRepository: WorkplaceRepository
  ) {}

  /**
   * Updates employment status based on age.
   */
  public evaluateCitizenEligibility(citizen: Citizen): void {
    const age = this.citizenService.getCitizenAge(citizen);

    if (age < 18) {
      if (citizen.workplaceId) {
        this.leaveJob(citizen);
      }
      citizen.employmentStatus = EmploymentStatus.STUDENT;
    } else if (age >= 75) {
      if (citizen.workplaceId) {
        this.leaveJob(citizen);
      }
      citizen.employmentStatus = EmploymentStatus.RETIRED;
    } else {
      if (citizen.employmentStatus === EmploymentStatus.STUDENT || citizen.employmentStatus === EmploymentStatus.RETIRED) {
        citizen.employmentStatus = EmploymentStatus.UNEMPLOYED;
      }
      // If they don't have a job and aren't anything else, they are unemployed
      if (!citizen.workplaceId) {
        citizen.employmentStatus = EmploymentStatus.UNEMPLOYED;
      }
    }
  }

  /**
   * Removes a citizen from their current job position.
   */
  public leaveJob(citizen: Citizen): void {
    if (!citizen.workplaceId) return;

    const workplace = this.workplaceRepository.findById(citizen.workplaceId);
    if (workplace) {
      const position = workplace.positions.find(p => p.occupantId === citizen.id);
      if (position) {
        position.occupantId = null;
        workplace.occupiedPositions--;
        workplace.vacancies++;
        this.workplaceRepository.update(workplace);
      }
    }

    citizen.workplaceId = null;
    citizen.jobType = null;
    citizen.jobSchedule = null;
    citizen.employmentStatus = EmploymentStatus.UNEMPLOYED;
  }

  /**
   * Assigns an eligible citizen to a specific job position.
   */
  public assignJob(citizen: Citizen, workplace: Workplace, position: JobPosition): void {
    if (position.occupantId) {
      throw new Error('Position is already occupied');
    }

    if (workplace.vacancies <= 0) {
      throw new Error('Workplace has no vacancies');
    }

    position.occupantId = citizen.id;
    workplace.occupiedPositions++;
    workplace.vacancies--;
    this.workplaceRepository.update(workplace);

    citizen.workplaceId = workplace.id;
    citizen.jobType = position.type;
    citizen.jobSchedule = position.schedule;
    citizen.employmentStatus = EmploymentStatus.EMPLOYED;
  }

  /**
   * Calculates how suitable a citizen is for a given job position based on their skills.
   * Returns a score (0-100). If a required skill is completely lacking, the score might be 0, 
   * but generally it is an average of required skill levels.
   */
  public calculateSuitability(citizen: Citizen, position: JobPosition): number {
    const reqs = Object.entries(position.requiredSkills) as [SkillType, number][];
    if (reqs.length === 0) return 50; // Base suitability for unskilled labor

    let totalScore = 0;
    let matchCount = 0;

    for (const [skillType, minRequired] of reqs) {
      const citizenSkill = citizen.skills.find(s => s.type === skillType);
      const level = citizenSkill ? citizenSkill.level : 0;
      
      if (level < minRequired) {
        return 0; // Does not meet minimum requirement
      }

      totalScore += level;
      matchCount++;
    }

    return totalScore / matchCount;
  }

  /**
   * Deterministically assigns all vacant positions across all workplaces
   * to eligible unemployed citizens.
   */
  public runJobAssignment(): void {
    const citizens = this.citizenService.listCitizens();
    
    // 1. Evaluate all eligibility
    for (const citizen of citizens) {
      this.evaluateCitizenEligibility(citizen);
    }

    // 2. Gather eligible candidates
    const eligibleCitizens = citizens.filter(c => c.employmentStatus === EmploymentStatus.UNEMPLOYED);

    // 3. Gather all vacant positions
    const workplaces = this.workplaceRepository.findAll();
    const allVacantPositions: { workplace: Workplace, position: JobPosition }[] = [];

    for (const wp of workplaces) {
      if (wp.vacancies > 0) {
        for (const pos of wp.positions) {
          if (!pos.occupantId) {
            allVacantPositions.push({ workplace: wp, position: pos });
          }
        }
      }
    }

    // Deterministic sort for positions so assignment order is stable
    allVacantPositions.sort((a, b) => a.position.id.localeCompare(b.position.id));

    // 4. Assign positions
    for (const { workplace, position } of allVacantPositions) {
      // Find all candidates that meet the minimum requirements
      const candidatesWithScores = eligibleCitizens
        .filter(c => c.employmentStatus === EmploymentStatus.UNEMPLOYED)
        .map(c => ({ citizen: c, score: this.calculateSuitability(c, position) }))
        .filter(c => c.score > 0);

      if (candidatesWithScores.length > 0) {
        // Sort by score (descending), then deterministically by ID to break ties
        candidatesWithScores.sort((a, b) => {
          if (b.score !== a.score) {
            return b.score - a.score;
          }
          return a.citizen.id.localeCompare(b.citizen.id);
        });

        const bestCandidate = candidatesWithScores[0].citizen;
        this.assignJob(bestCandidate, workplace, position);
      }
    }
  }
}
