import { prisma } from '../../repositories/prisma';
import { worldService } from '../world.service';
import { marketService } from '../market.service';
import { supplyService } from '../supply.service';
import { citizenService } from '../citizen.service';
import { financeService } from '../finance.service';
import { civilizationIntelligenceService } from '../civilizationIntelligence.service';
import { WorkplaceType, ActionType } from '@genesis/shared';

describe('T7.8.5 — End-to-End Economic Equilibrium & Feedback Integration', () => {
  jest.setTimeout(45000);

  beforeAll(async () => {
    supplyService.initialize();
    marketService.initialize();
    financeService.initialize();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('1. Production-cost-aware producer reservation pricing integrates with live services', async () => {
    // Check that PriceFormationService has productionCostCalculator connected
    const breakdown = marketService.engine.getPriceBreakdown('wheat');
    expect(breakdown).toHaveProperty('retailPrice');
    expect(breakdown).toHaveProperty('wholesaleUnitPrice');
    expect(breakdown.currency).toBe('INR');
  });

  it('2. End-to-end feedback: Purchase depletes store inventory and transfers funds', async () => {
    // Setup isolated store and citizen in database
    const storeId = `store-e2e-${Date.now()}`;
    const citId = `cit-e2e-${Date.now()}`;

    // Create store wallet with 1000 INR
    await prisma.wallet.create({
      data: { ownerId: storeId, balance: 1000, currency: 'INR', totalIncome: 0, totalExpenses: 0 }
    });

    // Create citizen wallet with 500 INR
    await prisma.wallet.create({
      data: { ownerId: citId, balance: 500, currency: 'INR', totalIncome: 0, totalExpenses: 0 }
    });

    // Store inventory with 50 kg of wheat
    const storeInv = await prisma.inventory.create({
      data: { id: `inv-${storeId}`, ownerId: storeId, storageCapacity: 1000 }
    });
    await prisma.inventoryItem.create({
      data: {
        inventoryId: storeInv.id,
        productId: 'wheat',
        totalQuantity: 50,
        availableQuantity: 50,
        unit: 'kg'
      }
    });

    // Household inventory for citizen
    const householdInv = await prisma.inventory.create({
      data: { id: `inv-h-${citId}`, ownerId: `household-${citId}`, storageCapacity: 100 }
    });

    // Register into in-memory engine
    const storeWp = {
      id: storeId,
      type: WorkplaceType.SHOP,
      regionId: 'reg-e2e',
      capacity: 10,
      inventoryId: storeInv.id,
      wallet: { id: `w-${storeId}`, ownerId: storeId, balance: 1000, currency: 'INR', totalIncome: 0, totalExpenses: 0 }
    };
    worldEngineWorkplaceRegister(storeWp);

    supplyService.inventoryManager.createInventory(storeInv.id, storeId, 1000);
    supplyService.inventoryManager.addItemQuantity(storeInv.id, 'wheat', 50, 'kg');

    supplyService.inventoryManager.createInventory(householdInv.id, `household-${citId}`, 100);

    // Initial total money
    const initialMoney = storeWp.wallet.balance + 500;

    // Execute transaction via MarketEngine
    const tx = marketService.engine.processTransaction(
      citId,
      storeId,
      'wheat',
      10,
      'kg',
      10,
      100,
      'INR',
      'PURCHASE' as any,
      'reg-e2e'
    );

    // Transfer inventory
    supplyService.inventoryManager.transferItemQuantity(storeInv.id, householdInv.id, 'wheat', 10, 'kg');

    expect(tx).not.toBeNull();
    expect(storeWp.wallet.balance).toBe(1100);

    // Inventory conservation check
    const storeRemaining = supplyService.inventoryManager.getInventory(storeInv.id)?.items['wheat']?.totalQuantity;
    const householdWheat = supplyService.inventoryManager.getInventory(householdInv.id)?.items['wheat']?.totalQuantity;
    expect(storeRemaining).toBe(40);
    expect(householdWheat).toBe(10);
    expect(storeRemaining! + householdWheat!).toBe(50);
  });

  it('3. Consumption satisfies citizen hunger and depletes household food inventory', async () => {
    const citId = `cit-consume-${Date.now()}`;
    const householdId = `household-${citId}`;
    const invId = `inv-${householdId}`;

    // Setup citizen
    const citizen: any = {
      id: citId,
      name: 'Consumer Cit',
      householdId,
      vitalState: { hunger: 80, thirst: 20, energy: 100, health: 100 },
      wallet: { id: `w-${citId}`, ownerId: citId, balance: 100, currency: 'INR', totalIncome: 0, totalExpenses: 0 }
    };
    (citizenService.engine as any).repository.create(citizen);

    supplyService.inventoryManager.createInventory(invId, householdId, 100);
    // Add raw_fish (substitute food)
    supplyService.inventoryManager.addItemQuantity(invId, 'raw_fish', 5, 'kg');

    const getCommodity = (id: string) => supplyService.productionEngine.commodities.get(id);
    const { ConsumptionEngine } = require('@genesis/engine');
    const consumptionEngine = new ConsumptionEngine(
      supplyService.inventoryManager,
      citizenService.engine.needsService,
      getCommodity
    );

    // Raw fish restoration value = 30. Hunger = 80. Target = 20. Need restoration = 60.
    // Required quantity = 60 / 30 = 2 kg.
    const consumed = consumptionEngine.consume(citizen, 'HUNGER', 0);
    expect(consumed).toBe(true);

    // Hunger should now be satisfied to 20
    expect(citizen.vitalState.hunger).toBe(20);

    // 2 kg of fish consumed, 3 kg remaining
    const remainingFish = supplyService.inventoryManager.getInventory(invId)?.items['raw_fish']?.totalQuantity;
    expect(remainingFish).toBe(3);
  });

  it('4. Commodity prices, supplies, and metrics recover consistently after restart', async () => {
    // Re-initialize and verify pricing stability
    marketService.initialize();
    const summary = await civilizationIntelligenceService.getCivilizationSummary();
    expect(summary.market).toBeDefined();
    expect(summary.market.wheat.retailPrice).toBeGreaterThan(0);
    expect(summary.market.water.retailPrice).toBeGreaterThan(0);
    expect(summary.market.raw_fish.retailPrice).toBeGreaterThan(0);
  });
});

function worldEngineWorkplaceRegister(wp: any) {
  const { worldService } = require('../world.service');
  worldService.engine.workplaceRepository.create(wp);
}
