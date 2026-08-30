import { Workplace, Citizen } from '@genesis/shared';
import { WorldEngine } from '../world/WorldEngine';
import { JobBaseSalary, JobRiskMultiplier } from '../citizen/services/SalaryConfig';
import { ResourceValuation } from './ResourceValuationConfig';
import { SalaryService } from '../citizen/services/SalaryService';

export interface ProductionCostResult {
  workplaceId: string;
  laborCost: number;
  inputCost: number;
  operatingCost: number;
  totalCost: number;
}

export class ProductionCostCalculator {
  public citizenProvider?: (id: string) => Citizen | undefined;

  constructor(private worldEngine: WorldEngine) {}

  public calculateCost(workplaceId: string, resourcesConsumed: Record<string, number>): ProductionCostResult {
    const workplace = this.worldEngine.workplaceRepository.findById(workplaceId);
    if (!workplace) {
      return { workplaceId, laborCost: 0, inputCost: 0, operatingCost: 0, totalCost: 0 };
    }

    let laborCost = 0;
    for (const pos of workplace.positions) {
      if (pos.occupantId) {
        let monthlyCost = 0;
        if (this.citizenProvider) {
          const citizen = this.citizenProvider(pos.occupantId);
          if (citizen) {
            monthlyCost = SalaryService.calculateExpectedMonthlySalary(citizen, workplace);
          }
        }
        
        if (monthlyCost === 0) {
          const base = JobBaseSalary[pos.type] || 1000;
          const risk = JobRiskMultiplier[pos.type] || 1.0;
          monthlyCost = base * risk;
        }

        // Daily cost for production cycle (monthly salary / 30)
        laborCost += monthlyCost / 30;
      }
    }

    let inputCost = 0;
    for (const [resId, qty] of Object.entries(resourcesConsumed)) {
       const unitPrice = ResourceValuation[resId] || ResourceValuation['DEFAULT'] || 5;
       inputCost += qty * unitPrice;
    }

    const operatingCost = 0; // Placeholder for future
    const totalCost = laborCost + inputCost + operatingCost;

    return {
      workplaceId,
      laborCost,
      inputCost,
      operatingCost,
      totalCost
    };
  }
}
