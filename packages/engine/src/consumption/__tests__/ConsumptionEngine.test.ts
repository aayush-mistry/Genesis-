import { ConsumptionEngine } from '../ConsumptionEngine';
import { ConsumptionLedger } from '../ConsumptionLedger';
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
    
    const ledger = new ConsumptionLedger();
    consumptionEngine = new ConsumptionEngine(inventoryManager, needsService, getCommodity, ledger);

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
      jobSchedule: null,
      personality: {
        priceSensitivity: 50,
        qualityPreference: 50,
        conveniencePreference: 50,
        planningTendency: 50,
        socialEngagement: 50,
        riskTolerance: 50,
        savingTendency: 50
      },
      householdId: 'house-1'
    };

    repo.create(citizen);
    inventoryManager.createInventory('inv-house-1', 'house-1', 100);
  });

  it('should successfully consume food and reduce hunger', () => {
    // Add 5 units of food
    inventoryManager.addItemQuantity('inv-house-1', 'food_item', 5, 'kg', 0, 1000);
    
    expect(citizen.vitalState.hunger).toBe(80);
    
    // Consume food. Required: 80 - 20 = 60. Value: 20. Need: 3 units.
    const success = consumptionEngine.consume(citizen, 'HUNGER', 0, 20);
    
    expect(success).toBe(true);
    expect(citizen.vitalState.hunger).toBe(20);
    
    const inv = inventoryManager.getInventory('inv-house-1');
    expect(inv?.items['food_item'].totalQuantity).toBe(2);
  });

  it('should successfully consume water and reduce thirst', () => {
    inventoryManager.addItemQuantity('inv-house-1', 'water_item', 3, 'L', 0, 1000);
    
    expect(citizen.vitalState.thirst).toBe(70);
    
    // Required: 70 - 20 = 50. Value: 25. Need: 2 units.
    const success = consumptionEngine.consume(citizen, 'THIRST', 0, 20);
    
    expect(success).toBe(true);
    expect(citizen.vitalState.thirst).toBe(20);
    
    const inv = inventoryManager.getInventory('inv-house-1');
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
    inventoryManager.addItemQuantity('inv-house-1', 'food_item', 1, 'kg', 0, 1000);
    
    // Required: 3 units. Available: 1 unit.
    const success = consumptionEngine.consume(citizen, 'HUNGER', 0, 20);
    
    expect(success).toBe(true);
    expect(citizen.vitalState.hunger).toBe(60); // 80 - 20*1
    
    const inv = inventoryManager.getInventory('inv-house-1');
    expect(inv?.items['food_item']).toBeUndefined(); // All consumed
  });

  it('should fail if food is expired', () => {
    // Add food that expired at time 100
    inventoryManager.addItemQuantity('inv-house-1', 'food_item', 5, 'kg', 0, 100);
    
    // Current time is 200
    inventoryManager.removeExpiredItems(200);
    
    const success = consumptionEngine.consume(citizen, 'HUNGER', 200, 20);
    
    expect(success).toBe(false);
    expect(citizen.vitalState.hunger).toBe(80);
  });

  it('should fail gracefully if citizen has no householdId', () => {
    citizen.householdId = undefined;
    const success = consumptionEngine.consume(citizen, 'HUNGER', 0, 20);
    expect(success).toBe(false);
    expect(citizen.vitalState.hunger).toBe(80);
  });

  it('should fail gracefully if household inventory is missing', () => {
    citizen.householdId = 'non-existent-house';
    const success = consumptionEngine.consume(citizen, 'HUNGER', 0, 20);
    expect(success).toBe(false);
    expect(citizen.vitalState.hunger).toBe(80);
  });

  it('Ledger 1: Successful consumption creates exactly one persistent ledger record', () => {
    inventoryManager.addItemQuantity('inv-house-1', 'food_item', 5, 'kg', 0, 200000);
    const ledger = consumptionEngine.getConsumptionLedger()!;

    expect(ledger.count()).toBe(0);

    const success = consumptionEngine.consume(citizen, 'HUNGER', 86400, 20, 'evt-success-1', 'CITIZEN_NEED', 'reg-test');
    expect(success).toBe(true);

    expect(ledger.count()).toBe(1);
    const records = ledger.getRecords();
    expect(records[0].eventId).toBe('evt-success-1');
    expect(records[0].commodityId).toBe('food_item');
    expect(records[0].quantity).toBe(3); // (80 - 20) / 20 = 3 kg
    expect(records[0].unit).toBe('kg');
    expect(records[0].consumerId).toBe('citizen-1');
    expect(records[0].householdId).toBe('house-1');
    expect(records[0].regionId).toBe('reg-test');
    expect(records[0].simulationDay).toBe(2); // 86400s = day 2
  });

  it('Ledger 2: Failed consumption creates no ledger record', () => {
    const ledger = consumptionEngine.getConsumptionLedger()!;
    expect(ledger.count()).toBe(0);

    // No items in inventory -> should fail
    const success = consumptionEngine.consume(citizen, 'HUNGER', 1000, 20, 'evt-fail-1');
    expect(success).toBe(false);

    expect(ledger.count()).toBe(0);
  });

  it('Ledger 3: Retrying the same event does not duplicate consumption history', () => {
    inventoryManager.addItemQuantity('inv-house-1', 'water_item', 10, 'L', 0, 200000);
    const ledger = consumptionEngine.getConsumptionLedger()!;

    // First consumption with specific eventId
    const firstSuccess = consumptionEngine.consume(citizen, 'THIRST', 1000, 20, 'evt-idempotent-1');
    expect(firstSuccess).toBe(true);
    expect(ledger.count()).toBe(1);

    // Set hunger/thirst back to require more water
    citizen.vitalState.thirst = 70;

    // Retry with SAME eventId
    const secondSuccess = consumptionEngine.consume(citizen, 'THIRST', 1000, 20, 'evt-idempotent-1');
    expect(secondSuccess).toBe(true); // Inventory was deducted, but ledger rejected duplicate eventId

    expect(ledger.count()).toBe(1); // Still exactly 1 in ledger
  });
});

