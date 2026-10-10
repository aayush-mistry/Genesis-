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
import { EventRegistry } from '../../events/EventRegistry';

export class SalaryService {
  private eventId = 'PAYROLL_CYCLE_EVENT';

  private transactionChecker?: (txIds: string[]) => Promise<Set<string>>;

  constructor(
    private citizenService: CitizenService,
    private worldEngine: WorldEngine,
    private marketEngine: MarketEngine,
    private eventScheduler: EventScheduler,
    private timeEngine: TimeEngine
  ) {
    EventRegistry.register('SalaryService.runPayrollCycle', async () => {
      await this.runPayrollCycle();
    });
  }

  public setTransactionChecker(checker: (txIds: string[]) => Promise<Set<string>>) {
    this.transactionChecker = checker;
  }

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
      handlerName: 'SalaryService.runPayrollCycle',
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

  public async runPayrollCycle(): Promise<void> {
    const citizens = this.citizenService.listCitizens();
    const currentYear = this.timeEngine.getCurrentTime().year;
    const currentMonth = this.timeEngine.getCurrentTime().month;
    
    const candidates = citizens.filter(c => c.employmentStatus === EmploymentStatus.EMPLOYED && c.workplaceId && c.jobType);
    if (candidates.length === 0) return;

    let processedTxIds = new Set<string>();
    if (this.transactionChecker) {
      const txIds = candidates.map(c => `PAYROLL-${c.id}-${currentYear}-${currentMonth}`);
      processedTxIds = await this.transactionChecker(txIds);
    }
    
    for (const citizen of candidates) {
      const txId = `PAYROLL-${citizen.id}-${currentYear}-${currentMonth}`;
      if (processedTxIds.has(txId)) {
        // Recover state: if it was processed in DB but not saved to citizen memory
        if (citizen.employmentRecord && citizen.employmentRecord.daysWorked > 0) {
          citizen.employmentRecord.daysWorked = 0;
          citizen.employmentRecord.performanceScore = 1.0;
          citizen.employmentRecord.lastPaymentDate = TimeUtils.clone(this.timeEngine.getCurrentTime());
          // NOTE: We don't reconcile the wallet here; assuming outbox or periodic wallet reconciliation handles it.
        }
        continue;
      }
      this.processCitizenSalary(citizen);
    }
  }

  public static calculateExpectedMonthlySalary(citizen: Citizen, workplace: import('@genesis/shared').Workplace): number {
    if (!citizen.jobType) return 0;
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

    let participationFactor = 1.0;
    let performanceScore = 1.0;

    if (citizen.employmentRecord) {
      const { daysWorked, expectedWorkingDays } = citizen.employmentRecord;
      participationFactor = expectedWorkingDays > 0 ? (daysWorked / expectedWorkingDays) : 1.0;
      performanceScore = citizen.employmentRecord.performanceScore;
    }
    
    return Math.floor(baseSalary * riskMultiplier * skillMultiplier * participationFactor * performanceScore);
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
        lastPaymentDate: null,
        unpaidWages: 0
      };
    }

    const currentYear = this.timeEngine.getCurrentTime().year;
    const currentMonth = this.timeEngine.getCurrentTime().month;

    // Check memory-level idempotency to prevent double-processing within the same session
    if (citizen.employmentRecord.lastPaymentDate) {
      const lp = citizen.employmentRecord.lastPaymentDate;
      if (lp.year === currentYear && lp.month === currentMonth) {
        return; // Already processed this month
      }
    }

    const currentSalary = SalaryService.calculateExpectedMonthlySalary(citizen, workplace);
    
    // Total owed is current period's salary plus any previously unpaid wages
    const previousUnpaid = citizen.employmentRecord!.unpaidWages || 0;
    const totalOwed = currentSalary + previousUnpaid;

    if (totalOwed <= 0) {
      // Nothing to pay
      citizen.employmentRecord!.daysWorked = 0;
      citizen.employmentRecord!.performanceScore = 1.0;
      return;
    }

    // Determine how much we can actually pay
    let paymentAmount = 0;
    let debtRemaining = 0;

    if (workplace.wallet.balance >= totalOwed) {
      paymentAmount = totalOwed;
      debtRemaining = 0;
    } else {
      // Partial payment
      paymentAmount = workplace.wallet.balance;
      debtRemaining = totalOwed - paymentAmount;
    }

    if (paymentAmount > 0) {
      // Execute payment
      const tx = this.marketEngine.processTransaction(
        workplace.id, // buyer (payer)
        citizen.id,   // seller (payee)
        null,
        null,
        null,
        null,
        paymentAmount,
        workplace.wallet.currency,
        TransactionType.WAGE,
        workplace.regionId,
        `PAYROLL-${citizen.id}-${currentYear}-${currentMonth}`
      );

      if (tx) {
        citizen.employmentRecord!.lastPaymentDate = TimeUtils.clone(this.timeEngine.getCurrentTime());
      }
    }

    // Update debt
    citizen.employmentRecord!.unpaidWages = debtRemaining;
    
    // Reset counters for next month
    citizen.employmentRecord!.daysWorked = 0;
    citizen.employmentRecord!.performanceScore = 1.0; // Reset or decay

    if (debtRemaining > 0) {
      // Emit event for insufficient funds (whether partial payment or no payment)
      this.eventScheduler.emitter.emit('SalaryPaymentFailed', {
        citizenId: citizen.id,
        workplaceId: workplace.id,
        amount: debtRemaining,
        timestamp: TimeUtils.toSeconds(this.timeEngine.getCurrentTime())
      });
    }
  }
}
