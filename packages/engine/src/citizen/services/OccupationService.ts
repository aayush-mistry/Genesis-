import { Citizen, CitizenStatus, EmploymentStatus, JobPosition, JobType, SkillType, Workplace } from '@genesis/shared';
import { CitizenService } from './CitizenService';
import { WorkplaceRepository } from '../../world/repositories/WorkplaceRepository';

export class OccupationService {
  constructor(
    private citizenService: CitizenService,
    private workplaceRepository: WorkplaceRepository
  ) {}

  /**
   * Updates employment status based on age and status.
   */
  public evaluateCitizenEligibility(citizen: Citizen): void {
    if (citizen.status === CitizenStatus.DECEASED) {
      if (citizen.workplaceId) {
        this.leaveJob(citizen);
      }
      return;
    }

    if (!citizen.birthDate) {
      if (!citizen.workplaceId && citizen.employmentStatus !== EmploymentStatus.STUDENT && citizen.employmentStatus !== EmploymentStatus.RETIRED) {
        citizen.employmentStatus = EmploymentStatus.UNEMPLOYED;
      }
      return;
    }

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
        workplace.occupiedPositions = Math.max(0, workplace.occupiedPositions - 1);
        workplace.vacancies = Math.min(workplace.capacity, workplace.vacancies + 1);
        this.workplaceRepository.update(workplace);
      }
    }

    citizen.workplaceId = null;
    citizen.jobType = null;
    citizen.jobSchedule = null;
    if (citizen.status !== CitizenStatus.DECEASED) {
      citizen.employmentStatus = EmploymentStatus.UNEMPLOYED;
    }
    if (citizen.employmentRecord) {
      const currentTime = (this.citizenService as any).timeEngine?.getCurrentTime?.();
      citizen.employmentRecord.endDate = currentTime ? { ...currentTime } : null;
    }
  }

  /**
   * Assigns an eligible citizen to a specific job position.
   */
  public assignJob(citizen: Citizen, workplace: Workplace, position: JobPosition): void {
    if (citizen.status === CitizenStatus.DECEASED) {
      throw new Error('Cannot assign job to non-active or deceased citizen');
    }

    if (citizen.birthDate) {
      const age = this.citizenService.getCitizenAge(citizen);
      if (age < 18 || age >= 75) {
        throw new Error('Citizen is not of working age');
      }
    }

    if (citizen.workplaceId) {
      throw new Error('Citizen is already employed');
    }

    if (position.occupantId) {
      throw new Error('Position is already occupied');
    }

    if (workplace.vacancies <= 0 || workplace.occupiedPositions >= workplace.capacity) {
      throw new Error('Workplace has no vacancies');
    }

    position.occupantId = citizen.id;
    workplace.occupiedPositions = Math.min(workplace.capacity, workplace.occupiedPositions + 1);
    workplace.vacancies = Math.max(0, workplace.vacancies - 1);
    this.workplaceRepository.update(workplace);

    citizen.workplaceId = workplace.id;
    citizen.jobType = position.type;
    citizen.jobSchedule = position.schedule;
    citizen.employmentStatus = EmploymentStatus.EMPLOYED;

    const currentTime = (this.citizenService as any).timeEngine?.getCurrentTime?.() || { year: 1, month: 1, day: 1, hour: 0, minute: 0, second: 0 };
    if (!citizen.employmentRecord || citizen.employmentRecord.endDate) {
      citizen.employmentRecord = {
        daysWorked: 30,
        expectedWorkingDays: 30,
        performanceScore: 1.0,
        startDate: { ...currentTime },
        endDate: null,
        lastPaymentDate: null,
        unpaidWages: citizen.employmentRecord?.unpaidWages || 0,
        lastWorkDate: null
      };
    }
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
  public runJobAssignment(): Citizen[] {
    const citizens = this.citizenService.listCitizens();
    const assignedCitizens: Citizen[] = [];
    
    // 1. Evaluate all eligibility
    for (const citizen of citizens) {
      this.evaluateCitizenEligibility(citizen);
    }

    // 2. Gather eligible candidates: active, unemployed citizens of working age
    const eligibleCitizens = citizens.filter(
      c => c.status === CitizenStatus.ACTIVE && c.employmentStatus === EmploymentStatus.UNEMPLOYED && !c.workplaceId
    );

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
      // Re-verify position vacancy and workplace capacity
      if (position.occupantId || workplace.vacancies <= 0) continue;

      // Find all candidates that meet the minimum requirements and are still unemployed
      const candidatesWithScores = eligibleCitizens
        .filter(c => c.status === CitizenStatus.ACTIVE && c.employmentStatus === EmploymentStatus.UNEMPLOYED && !c.workplaceId)
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
        assignedCitizens.push(bestCandidate);
      }
    }

    return assignedCitizens;
  }
}
