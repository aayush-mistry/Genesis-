import { Workplace, TransactionRecord, TransactionType } from '@genesis/shared';
import { WorldEngine } from '../world/WorldEngine';

export class BusinessAccounting {
  constructor(private worldEngine: WorldEngine) {}

  public recordRevenue(workplaceId: string, amount: number, transaction: TransactionRecord): void {
    const workplace = this.worldEngine.workplaceRepository.findById(workplaceId);
    if (!workplace) return;

    if (!workplace.revenue) workplace.revenue = 0;
    workplace.revenue += amount;
    this.updateProfit(workplace);
  }

  public recordExpense(workplaceId: string, amount: number, transaction: TransactionRecord): void {
    const workplace = this.worldEngine.workplaceRepository.findById(workplaceId);
    if (!workplace) return;

    if (!workplace.expenses) workplace.expenses = 0;
    workplace.expenses += amount;
    this.updateProfit(workplace);
  }

  public recordRevenueReversal(workplaceId: string, amount: number): void {
    const workplace = this.worldEngine.workplaceRepository.findById(workplaceId);
    if (!workplace) return;

    if (workplace.revenue !== undefined) {
      workplace.revenue = Math.max(0, workplace.revenue - amount);
      this.updateProfit(workplace);
    }
  }

  public recordExpenseReversal(workplaceId: string, amount: number): void {
    const workplace = this.worldEngine.workplaceRepository.findById(workplaceId);
    if (!workplace) return;

    if (workplace.expenses !== undefined) {
      workplace.expenses = Math.max(0, workplace.expenses - amount);
      this.updateProfit(workplace);
    }
  }

  private updateProfit(workplace: Workplace): void {
    const revenue = workplace.revenue || 0;
    const expenses = workplace.expenses || 0;
    workplace.profit = revenue - expenses;
  }

  public recordProductionMetrics(workplaceId: string, costResult: import('./ProductionCostCalculator').ProductionCostResult): void {
    const workplace = this.worldEngine.workplaceRepository.findById(workplaceId);
    if (!workplace) return;

    if (!workplace.accounting) {
      workplace.accounting = { history: [] };
    }
    
    // We can store the current period's accumulated metrics on the workplace object itself
    // so they can be captured in closeAccountingPeriod.
    if (!(workplace as any).currentPeriodProductionCosts) {
      (workplace as any).currentPeriodProductionCosts = 0;
    }
    (workplace as any).currentPeriodProductionCosts += costResult.totalCost;
  }

  public recordSpoilageLoss(workplaceId: string, amount: number, spoilageRecord?: import('@genesis/shared').SpoilageRecord): void {
    const workplace = this.worldEngine.workplaceRepository.findById(workplaceId);
    if (!workplace) return;

    if (!workplace.accounting) {
      workplace.accounting = { history: [] };
    }

    if (!(workplace as any).currentPeriodSpoilageLosses) {
      (workplace as any).currentPeriodSpoilageLosses = 0;
    }
    if (amount > 0) {
      (workplace as any).currentPeriodSpoilageLosses += amount;
    }
  }

  public closeAccountingPeriod(workplaceId: string, periodStart: number, periodEnd: number): void {
    const workplace = this.worldEngine.workplaceRepository.findById(workplaceId);
    if (!workplace) return;

    if (!workplace.accounting) {
      workplace.accounting = { history: [] };
    }

    workplace.accounting.history.push({
      periodStart,
      periodEnd,
      revenue: workplace.revenue || 0,
      expenses: workplace.expenses || 0,
      profit: workplace.profit || 0,
      salaryExpenses: 0, // In full implementation, these would be tracked properly
      procurementExpenses: 0,
      transportExpenses: 0,
      productionCosts: (workplace as any).currentPeriodProductionCosts || 0,
      operatingCosts: 0,
      spoilageLosses: (workplace as any).currentPeriodSpoilageLosses || 0
    });

    // Reset current period
    workplace.revenue = 0;
    workplace.expenses = 0;
    workplace.profit = 0;
    (workplace as any).currentPeriodProductionCosts = 0;
    (workplace as any).currentPeriodSpoilageLosses = 0;
  }
}
