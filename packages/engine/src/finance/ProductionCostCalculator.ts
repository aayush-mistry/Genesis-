import { Workplace } from '@genesis/shared';
import { WorldEngine } from '../world/WorldEngine';

export class ProductionCostCalculator {
  constructor(private worldEngine: WorldEngine) {}

  public calculateCost(workplaceId: string, resourcesConsumed: Record<string, number>): number {
    const workplace = this.worldEngine.workplaceRepository.findById(workplaceId);
    if (!workplace) return 0;

    // A simplified model: Cost is based on salaries of employed workers + raw materials
    // Since this is a basic model, we assume a fixed cost for resources if not procured from market
    let totalCost = 0;

    // Example logic for labor cost: daily salary proportioned by production duration
    // For Phase 7, we'll assign a flat rate for demonstration unless there's a specific formula
    totalCost += workplace.occupiedPositions * 10; // example: 10 INR per worker per cycle

    // Example logic for resource cost
    for (const [resId, qty] of Object.entries(resourcesConsumed)) {
       totalCost += qty * 5; // example: 5 INR per unit of raw material
    }

    return totalCost;
  }
}
