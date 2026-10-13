import { Household } from '@genesis/shared';
import { InventoryManager } from '../../inventory/InventoryManager';

export class HouseholdService {
  private households: Map<string, Household> = new Map();
  private counter: number = 0;

  constructor(
    private inventoryManager: InventoryManager
  ) {}

  public createHousehold(locationId: string, customId?: string): Household {
    this.counter++;
    const id = customId || `household-${Date.now()}-${this.counter}-${Math.floor(Math.random() * 10000)}`;
    const inventoryId = `inv-${id}`;
    const walletId = `wallet-${id}`;

    // Provide a large enough inventory for a household (e.g., 500 capacity)
    if (!this.inventoryManager.getInventory(inventoryId)) {
      this.inventoryManager.createInventory(inventoryId, id, 500);
    }
    
    const household: Household = {
      id,
      locationId,
      inventoryId,
      walletId,
      members: []
    };

    this.households.set(id, household);
    return household;
  }

  public registerHousehold(household: Household): void {
    if (!this.inventoryManager.getInventory(household.inventoryId)) {
      this.inventoryManager.createInventory(household.inventoryId, household.id, 500);
    }
    this.households.set(household.id, household);
  }

  public getHousehold(id: string): Household | undefined {
    return this.households.get(id);
  }

  public getAllHouseholds(): Household[] {
    return Array.from(this.households.values());
  }

  public getHouseholdsByLocation(locationId: string): Household[] {
    return Array.from(this.households.values()).filter(h => h.locationId === locationId);
  }

  public addMember(householdId: string, citizenId: string): void {
    const household = this.households.get(householdId);
    if (household && !household.members.includes(citizenId)) {
      household.members.push(citizenId);
    }
  }

  public removeMember(householdId: string, citizenId: string): void {
    const household = this.households.get(householdId);
    if (household) {
      household.members = household.members.filter(id => id !== citizenId);
    }
  }

  public provisionStarterResources(householdId: string): void {
    const household = this.households.get(householdId);
    if (!household) return;

    // Provide starter food and water
    this.inventoryManager.addItemQuantity(household.inventoryId, 'wheat', 20, 'kg');
    this.inventoryManager.addItemQuantity(household.inventoryId, 'water', 50, 'l');
  }

  public clear(): void {
    this.households.clear();
  }
}
