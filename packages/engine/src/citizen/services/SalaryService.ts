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

    // Initialize employment record if missing
    if (!citizen.employmentRecord) {
      citizen.employmentRecord = {
        daysWorked: 30, // Default to a full month if missing
        expectedWorkingDays: 30,
        performanceScore: 1.0,
        startDate: TimeUtils.clone(this.timeEngine.getCurrentTime()),
        endDate: null,
        lastPaymentDate: null
      };
    }

    const baseSalary = JobBaseSalary[citizen.jobType] || 1000;
    const riskMultiplier = JobRiskMultiplier[citizen.jobType] || 1.0;
    
    // Skill multiplier
    const requiredSkills = workplace.positions.find(p => p.occupantId === citizen.id)?.requiredSkills || {};
    let skillMultiplier = 1.0;
    
    const reqs = Object.entries(requiredSkills);
    if (reqs.length > 0) {
      let totalSkillMatch = 0;
      for (const [skillType] of reqs) {
        const citizenSkill = citizen.skills.find(s => s.type === skillType as any);
        totalSkillMatch += citizenSkill ? (citizenSkill.level / 100) : 0;
      }
      skillMultiplier = 1.0 + (totalSkillMatch / reqs.length);
    }

    const { daysWorked, expectedWorkingDays, performanceScore } = citizen.employmentRecord;
    const participationFactor = expectedWorkingDays > 0 ? (daysWorked / expectedWorkingDays) : 1.0;
    
    const finalSalary = Math.floor(baseSalary * riskMultiplier * skillMultiplier * participationFactor * performanceScore);

    if (workplace.wallet.balance >= finalSalary) {
      // Execute payment
      const tx = this.marketEngine.processTransaction(
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

      if (tx) {
        citizen.employmentRecord.lastPaymentDate = TimeUtils.clone(this.timeEngine.getCurrentTime());
        // Reset counters for next month
        citizen.employmentRecord.daysWorked = 0;
        citizen.employmentRecord.performanceScore = 1.0; // Reset or decay
      }
    } else {
      // Not enough money to pay salary
      // Business financial status reflects the problem; obligation remains traceable
      // We don't reset daysWorked, so they get paid later or accrue debt
      this.eventScheduler.emitter.emit('SalaryPaymentFailed', {
        citizenId: citizen.id,
        workplaceId: workplace.id,
        amount: finalSalary,
        timestamp: TimeUtils.toSeconds(this.timeEngine.getCurrentTime())
      });
    }
  }
}
