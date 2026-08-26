import { ConsumptionEngine } from '../ConsumptionEngine';
import { InventoryManager } from '../../inventory/InventoryManager';
import { NeedsService } from '../../citizen/services/NeedsService';
import { InMemoryCitizenRepository } from '../../citizen/repositories/InMemoryCitizenRepository';
import { Citizen, CitizenGender, CitizenStatus, Commodity, ProductCategory } from '@genesis/shared';
import { TimeUtils } from '../../utils/TimeUtils';

describe('ConsumptionEngine', () => {
  let inventoryManager: InventoryManager;
  let needsService: NeedsService;
  let consumptionEngine: ConsumptionEngine;
  let getCommodity: (id: string) => Commodity | undefined;
  let citizen: Citizen;

  beforeEach(() => {
    inventoryManager = new InventoryManager();
    const repo = new InMemoryCitizenRepository();
    needsService = new NeedsService(repo);

    const commodities: Record<string, Commodity> = {
      'food_item': {
        id: 'food_item',
        name: 'Food',
        category: ProductCategory.FOOD,
        unit: 'kg',
        basePrice: 10,
        isBiological: true,
        consumable: { restorationNeed: 'HUNGER', restorationValue: 20 },
        perishable: { shelfLifeHours: 24 }
      },
      'water_item': {
        id: 'water_item',
        name: 'Water',
        category: ProductCategory.FOOD,
        unit: 'L',
        basePrice: 2,
        isBiological: true,
        consumable: { restorationNeed: 'THIRST', restorationValue: 25 }
      }
    };

    getCommodity = (id: string) => commodities[id];
    
    consumptionEngine = new ConsumptionEngine(inventoryManager, needsService, getCommodity);

    citizen = {
      id: 'citizen-1',
      name: 'Test',
      birthDate: { year: 1, month: 1, day: 1, hour: 0, minute: 0, second: 0 },
      gender: CitizenGender.MALE,
      status: CitizenStatus.ACTIVE,
      createdAt: { year: 1, month: 1, day: 1, hour: 0, minute: 0, second: 0 },
      locationId: 'loc-1',
      vitalState: {
        hunger: 80,
        thirst: 70,
        energy: 100,
        health: 100,
        lastUpdatedSimulationTime: { year: 1, month: 1, day: 1, hour: 0, minute: 0, second: 0 }
      },
      wallet: {
        id: 'w-c1',
        ownerId: 'c1',
        balance: 1000,
        totalIncome: 0,
        totalExpenses: 0,
        currency: 'GEN'
      },
      movementState: 'IDLE' as any,
      activeRoute: null,
      skills: [],
      employmentStatus: 'UNEMPLOYED' as any,
      workplaceId: null,
      jobType: null,
      jobSchedule: null
    };

    repo.create(citizen);
    inventoryManager.createInventory(citizen.id, citizen.id, 100);
  });

  it('should successfully consume food and reduce hunger', () => {
    // Add 5 units of food
    inventoryManager.addItemQuantity(citizen.id, 'food_item', 5, 'kg', 0, 1000);
    
    expect(citizen.vitalState.hunger).toBe(80);
    
    // Consume food. Required: 80 - 20 = 60. Value: 20. Need: 3 units.
    const success = consumptionEngine.consume(citizen, 'HUNGER', 0, 20);
    
    expect(success).toBe(true);
    expect(citizen.vitalState.hunger).toBe(20);
    
    const inv = inventoryManager.getInventory(citizen.id);
    expect(inv?.items['food_item'].totalQuantity).toBe(2);
  });

  it('should successfully consume water and reduce thirst', () => {
    inventoryManager.addItemQuantity(citizen.id, 'water_item', 3, 'L', 0, 1000);
    
    expect(citizen.vitalState.thirst).toBe(70);
    
    // Required: 70 - 20 = 50. Value: 25. Need: 2 units.
    const success = consumptionEngine.consume(citizen, 'THIRST', 0, 20);
    
    expect(success).toBe(true);
    expect(citizen.vitalState.thirst).toBe(20);
    
    const inv = inventoryManager.getInventory(citizen.id);
    expect(inv?.items['water_item'].totalQuantity).toBe(1);
  });

  it('should fail to consume if inventory is empty', () => {
    expect(citizen.vitalState.hunger).toBe(80);
    const success = consumptionEngine.consume(citizen, 'HUNGER', 0, 20);
    expect(success).toBe(false);
    expect(citizen.vitalState.hunger).toBe(80);
  });

  it('should only consume available amount if less than required', () => {
    // Add 1 unit of food
    inventoryManager.addItemQuantity(citizen.id, 'food_item', 1, 'kg', 0, 1000);
    
    // Required: 3 units. Available: 1 unit.
    const success = consumptionEngine.consume(citizen, 'HUNGER', 0, 20);
    
    expect(success).toBe(true);
    expect(citizen.vitalState.hunger).toBe(60); // 80 - 20*1
    
    const inv = inventoryManager.getInventory(citizen.id);
    expect(inv?.items['food_item']).toBeUndefined(); // All consumed
  });

  it('should fail if food is expired', () => {
    // Add food that expired at time 100
    inventoryManager.addItemQuantity(citizen.id, 'food_item', 5, 'kg', 0, 100);
    
    // Current time is 200
    inventoryManager.removeExpiredItems(200);
    
    const success = consumptionEngine.consume(citizen, 'HUNGER', 200, 20);
    
    expect(success).toBe(false);
    expect(citizen.vitalState.hunger).toBe(80);
  });
});
