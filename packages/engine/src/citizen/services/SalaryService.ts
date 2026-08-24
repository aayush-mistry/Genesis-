import { EventScheduler } from '../../events/EventScheduler';
import { TimeEngine } from '../../time/TimeEngine';
import { CitizenService } from './CitizenService';
import { MarketEngine } from '../../market/MarketEngine';
import { WorldEngine } from '../../world/WorldEngine';
import { SimulationEvent } from '../../events/SimulationEvent';
import { TimeUtils } from '../../utils/TimeUtils';
import { randomUUID } from 'crypto';
import { Citizen, EmploymentStatus, JobType, TransactionType } from '@genesis/shared';
import { JobBaseSalary, JobRiskMultiplier } from './SalaryConfig';

export class SalaryService {
  private eventId = 'PAYROLL_CYCLE_EVENT';

  constructor(
    private citizenService: CitizenService,
    private worldEngine: WorldEngine,
    private marketEngine: MarketEngine,
    private eventScheduler: EventScheduler,
    private timeEngine: TimeEngine
  ) {}

  public initialize(): void {
    // Schedule the first payroll cycle event 30 days from now, then recurring monthly
    const nextTime = TimeUtils.clone(this.timeEngine.getCurrentTime());
    nextTime.month += 1;
    if (nextTime.month > 12) {
      nextTime.month -= 12;
      nextTime.year += 1;
    }

    const payrollEvent: SimulationEvent = {
      id: this.eventId,
      name: 'Monthly Payroll',
      description: 'Disburses salaries to all employed citizens',
      scheduledTime: nextTime,
      createdTime: TimeUtils.clone(this.timeEngine.getCurrentTime()),
      status: 'Scheduled',
      priority: 'High', // High priority
      handler: async () => this.runPayrollCycle(),
      recurrence: {
        interval: 'Month'
      },
      sourceModule: 'SalaryService',
      targetModule: 'WorldEngine',
      cancelFlag: false,
      retryCount: 0
    };

    this.eventScheduler.scheduleEvent(payrollEvent);
  }

  public runPayrollCycle(): void {
    const citizens = this.citizenService.listCitizens();
    
    for (const citizen of citizens) {
      if (citizen.employmentStatus === EmploymentStatus.EMPLOYED && citizen.workplaceId && citizen.jobType) {
        this.processCitizenSalary(citizen);
      }
    }
  }

  private processCitizenSalary(citizen: Citizen): void {
    if (!citizen.workplaceId || !citizen.jobType) return;

    const workplace = this.worldEngine.workplaceRepository.findById(citizen.workplaceId);
    if (!workplace || !workplace.wallet) return;

    const baseSalary = JobBaseSalary[citizen.jobType] || 1000;
    const riskMultiplier = JobRiskMultiplier[citizen.jobType] || 1.0;
    
    // Skill multiplier (0 to 100 level, gives 1.0 to 2.0 multiplier)
    const requiredSkills = workplace.positions.find(p => p.occupantId === citizen.id)?.requiredSkills || {};
    let skillMultiplier = 1.0;
    
    const reqs = Object.entries(requiredSkills);
    if (reqs.length > 0) {
      let totalSkillMatch = 0;
      for (const [skillType] of reqs) {
        const citizenSkill = citizen.skills.find(s => s.type === skillType);
        totalSkillMatch += citizenSkill ? (citizenSkill.level / 100) : 0;
      }
      skillMultiplier = 1.0 + (totalSkillMatch / reqs.length);
    }

    const finalSalary = Math.floor(baseSalary * riskMultiplier * skillMultiplier);

    if (workplace.wallet.balance >= finalSalary) {
      // Execute payment
      this.marketEngine.processTransaction(
        workplace.id, // buyer (payer)
        citizen.id,   // seller (payee)
        null,
        null,
        null,
        null,
        finalSalary,
        workplace.wallet.currency,
        TransactionType.WAGE,
        workplace.regionId
      );
    } else {
      // Not enough money to pay salary
      // For now, they just don't get paid or we could add debt.
      // In Phase 6.4 we just ensure no negative balances.
    }
  }
}
