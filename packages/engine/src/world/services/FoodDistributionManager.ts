import { Building, BuildingType } from '@genesis/shared';
import { WorldEngine } from '../WorldEngine';

export interface FoodSource {
  buildingId: string;
  type: BuildingType;
  available: boolean;
  stockLevel: number;
}

export class FoodDistributionManager {
  private foodSources: Map<string, FoodSource> = new Map();

  constructor(private worldEngine: WorldEngine) {}

  /**
   * Scans the world for potential food source buildings and initializes them.
   * This is a foundation for a future economy system.
   */
  public initializeFoodSources(): void {
    const buildings = this.worldEngine.buildingManager.getAllBuildings();
    for (const building of buildings) {
      if (this.isFoodSourceType(building.type)) {
        this.registerFoodSource(building);
      }
    }
  }

  private isFoodSourceType(type: BuildingType): boolean {
    return type === BuildingType.STORE || type === BuildingType.RESTAURANT;
  }

  public registerFoodSource(building: Building): void {
    if (!this.foodSources.has(building.id)) {
      this.foodSources.set(building.id, {
        buildingId: building.id,
        type: building.type,
        available: true, // Initially available
        stockLevel: 100 // Abstract stock representation for Phase 5
      });
    }
  }

  public getFoodSource(buildingId: string): FoodSource | undefined {
    return this.foodSources.get(buildingId);
  }

  public isFoodSourceAvailable(buildingId: string): boolean {
    const source = this.foodSources.get(buildingId);
    return source ? source.available && source.stockLevel > 0 : false;
  }

  /**
   * Called when a citizen consumes food from this source.
   */
  public consumeFood(buildingId: string, amount: number = 1): boolean {
    const source = this.foodSources.get(buildingId);
    if (!source || !source.available || source.stockLevel < amount) {
      return false;
    }

    source.stockLevel -= amount;
    if (source.stockLevel <= 0) {
      source.available = false;
      source.stockLevel = 0;
    }

    return true;
  }
}
