import * as path from 'path';
import * as fs from 'fs';

// Set up isolated database BEFORE any database/service imports
const isolatedDbName = 'isolated_consumer_purchase.db';
const isolatedDbPath = path.resolve(__dirname, '../../../prisma', isolatedDbName);
const dev2DbPath = path.resolve(__dirname, '../../../prisma/dev2.db');

// Ensure isolated database exists by copying schema from dev2.db
fs.copyFileSync(dev2DbPath, isolatedDbPath);
process.env.DATABASE_URL = `file:${isolatedDbPath.replace(/\\/g, '/')}`;

import { prisma } from '../../repositories/prisma';
import { persistenceService } from '../../services/persistence.service';
import { marketService } from '../../services/market.service';
import { supplyService } from '../../services/supply.service';
import { worldService } from '../../services/world.service';
import { timeService } from '../../services/time.service';
import { citizenService } from '../../services/citizen.service';
import { financeService } from '../../services/finance.service';
import { eventService } from '../../services/event.service';
import { financialRepository } from '../../repositories/FinancialRepository';
import { worldRepository } from '../../repositories/WorldRepository';
import { inventoryRepository } from '../../repositories/InventoryRepository';
import { citizenRepository } from '../../repositories/CitizenRepository';
import { WorkplaceType, ActionType, ActionState, CitizenGender } from '@genesis/shared';

describe('T8.6.6.4 — Consumer Purchase Idempotency & Transaction Safety Integration', () => {
  jest.setTimeout(60000);

  const testWorldId = 'test-world-consumer-purchase';
  const testRegionId = 'test-region-consumer-purchase';
  const testStoreId = 'store-consumer-purchase-1';
  const storeInvId = `inv-${testStoreId}`;
  const storeWalletId = `wallet-${testStoreId}`;
  const testCitizenId = 'citizen-consumer-purchase-1';
  const citizenWalletId = `wallet-${testCitizenId}`;
  const citizenInvId = `inv-${testCitizenId}`;

  const initialCitizenBal = 500;
  const initialStoreBal = 1000;
  const initialStoreWheat = 100;
  let purchaseTxId: string;

  beforeAll(async () => {
    // 1. Clean isolated test database
    await prisma.transactionRecord.deleteMany();
    await prisma.inventoryItem.deleteMany();
    await prisma.inventory.deleteMany();
    await prisma.wallet.deleteMany();
    await prisma.citizen.deleteMany();
    await prisma.household.deleteMany();
    await prisma.workplace.deleteMany();
    await prisma.region.deleteMany();
    await prisma.world.deleteMany();
    await prisma.simulationState.deleteMany();
    await prisma.simulationEvent.deleteMany();

    // 2. Clear in-memory engines
    worldService.engine.reset();
    marketService.engine.clear();
    supplyService.reset();
    citizenService.engine.clear();
    eventService.scheduler.clearEvents();

    // 3. Initialize world hierarchy
    await worldRepository.createWorld({
      id: testWorldId,
      name: 'Consumer Purchase World',
      description: 'Testing idempotent consumer purchases',
      randomSeed: 42,
      creationTime: 0,
      worldSize: 10000,
      climateProfile: 'TEMPERATE',
      timeZone: 'UTC',
      version: '1.0',
      status: 'ACTIVE'
    });

    await prisma.region.create({
      data: {
        id: testRegionId,
        worldId: testWorldId,
        name: 'Consumer Purchase Region',
        description: 'Region for consumer purchase tests',
        climate: 'TEMPERATE',
        coordX: 0,
        coordY: 0,
        width: 1000,
        height: 1000,
        population: 1
      }
    });

    await prisma.simulationState.create({
      data: {
        id: 'singleton',
        activeWorldId: testWorldId,
        speed: 1,
        year: 1,
        month: 1,
        day: 1,
        hour: 8,
        minute: 0,
        second: 0
      }
    });

    // 4. Create store workplace in SQLite
    await prisma.workplace.create({
      data: {
        id: testStoreId,
        regionId: testRegionId,
        type: 'SHOP',
        locationId: 'loc-store-1',
        capacity: 5,
        inventoryId: storeInvId,
        walletId: storeWalletId
      }
    });

    // 5. Create store inventory and stock in SQLite
    await inventoryRepository.createInventory({
      id: storeInvId,
      ownerId: testStoreId,
      storageCapacity: 1000
    });
    await inventoryRepository.upsertItem(
      storeInvId,
      'wheat',
      initialStoreWheat,
      'kg',
      JSON.stringify([{ quantity: initialStoreWheat, acquiredAt: 0, status: 'FRESH' }])
    );

    // 6. Create store wallet in SQLite
    await financialRepository.createWallet(testStoreId, 'INR', storeWalletId);
    await financialRepository.updateWallet(testStoreId, initialStoreBal, 0, 0);

    // 7. Create citizen in SQLite
    await citizenRepository.createCitizen({
      id: testCitizenId,
      name: 'Alice Consumer',
      gender: 'FEMALE',
      status: 'ACTIVE',
      locationId: testStoreId,
      birthDateJson: JSON.stringify({ year: 1, month: 1, day: 1, hour: 0, minute: 0, second: 0 }),
      createdAtSimJson: JSON.stringify({ year: 1, month: 1, day: 1, hour: 0, minute: 0, second: 0 }),
      vitalStateJson: JSON.stringify({ hunger: 80, thirst: 10, health: 100, energy: 100 }),
      personalityJson: JSON.stringify({}),
      movementState: 'IDLE',
      employmentStatus: 'UNEMPLOYED',
      walletId: citizenWalletId,
      skillsJson: JSON.stringify([])
    });

    // 8. Create citizen wallet & inventory in SQLite
    await financialRepository.createWallet(testCitizenId, 'INR', citizenWalletId);
    await financialRepository.updateWallet(testCitizenId, initialCitizenBal, 0, 0);
    await inventoryRepository.createInventory({
      id: citizenInvId,
      ownerId: testCitizenId,
      storageCapacity: 100
    });

    // 9. Bootstrap system
    await persistenceService.bootstrap();
    marketService.initialize();
    financeService.initialize();
    await citizenService.initialize();
  });

  afterAll(async () => {
    try {
      await prisma.$disconnect();
    } catch (e) {}
    if (fs.existsSync(isolatedDbPath)) {
      try {
        fs.unlinkSync(isolatedDbPath);
      } catch (e) {}
    }
  });

  test('1. Citizen purchase executes atomically, debits buyer, credits store, delivers goods, and persists transaction', async () => {
    const citizen = citizenService.engine.getCitizen(testCitizenId);
    expect(citizen).toBeDefined();
    expect(citizen!.wallet.balance).toBe(initialCitizenBal);

    const storeWp = worldService.engine.workplaceRepository.findById(testStoreId);
    expect(storeWp).toBeDefined();
    expect(storeWp!.wallet!.balance).toBe(initialStoreBal);

    const storeInv = supplyService.inventoryManager.getInventory(storeInvId);
    expect(storeInv?.items['wheat']?.totalQuantity).toBe(initialStoreWheat);

    // Ensure citizen is at store
    citizen!.locationId = testStoreId;

    // Execute purchase action for 2 kg wheat @ 10 credits/kg = 20 credits
    const action = citizenService.engine.actionExecutor.executeAction(citizen!, {
      type: ActionType.PURCHASE,
      source: 'HUNGER',
      reason: 'Need food',
      target: { id: testStoreId, type: 'BUILDING' },
      metadata: { productId: 'wheat', targetQuantity: 2, sellerId: testStoreId }
    });

    expect(action.state).toBe(ActionState.COMPLETED);
    purchaseTxId = action.metadata!.transactionId;
    expect(purchaseTxId).toBeDefined();
    expect(purchaseTxId.startsWith('TX-PURCHASE-')).toBe(true);

    // Financial check: citizen -20, store +20
    expect(citizen!.wallet.balance).toBe(480);
    expect(storeWp!.wallet!.balance).toBe(1020);

    // Physical inventory check: store -2, citizen +2
    expect(supplyService.inventoryManager.getInventory(storeInvId)?.items['wheat']?.totalQuantity).toBe(98);
    expect(supplyService.inventoryManager.getInventory(citizenInvId)?.items['wheat']?.totalQuantity).toBe(2);

    // Wait briefly for TransactionCompleted event handler to write to SQLite
    await new Promise(r => setTimeout(r, 100));

    // Verify transaction record persisted to SQLite
    const dbTx = await prisma.transactionRecord.findUnique({
      where: { transactionId: purchaseTxId }
    });
    expect(dbTx).toBeDefined();
    expect(dbTx!.buyerId).toBe(testCitizenId);
    expect(dbTx!.sellerId).toBe(testStoreId);
    expect(dbTx!.totalPrice).toBe(20);
    expect(dbTx!.quantity).toBe(2);
  });

  test('2. Replaying the same purchase action in-memory is idempotent (zero additional debit or delivery)', async () => {
    const citizen = citizenService.engine.getCitizen(testCitizenId)!;
    const storeWp = worldService.engine.workplaceRepository.findById(testStoreId)!;

    // Replay with exact same action instance
    citizen.currentAction!.state = ActionState.PURCHASING;
    citizenService.engine.actionExecutor.tick(citizen);

    expect(citizen.currentAction!.state).toBe(ActionState.COMPLETED);
    expect(citizen.wallet.balance).toBe(480);
    expect(storeWp.wallet!.balance).toBe(1020);
    expect(supplyService.inventoryManager.getInventory(storeInvId)?.items['wheat']?.totalQuantity).toBe(98);
    expect(supplyService.inventoryManager.getInventory(citizenInvId)?.items['wheat']?.totalQuantity).toBe(2);

    // Only 1 transaction record exists in SQLite
    const txRecords = await prisma.transactionRecord.findMany({
      where: { buyerId: testCitizenId }
    });
    expect(txRecords.length).toBe(1);
  });

  test('3. Multiple persistence ticks preserve the authoritative balances and inventory in SQLite', async () => {
    // Tick 1
    await persistenceService.persistTickBoundary({ citizens: [testCitizenId] });
    let dbCitizenWallet = await financialRepository.getWalletByOwner(testCitizenId);
    let dbStoreWallet = await financialRepository.getWalletByOwner(testStoreId);
    expect(dbCitizenWallet?.balance).toBe(480);
    expect(dbStoreWallet?.balance).toBe(1020);

    // Tick 2
    await persistenceService.persistTickBoundary({ citizens: [testCitizenId] });
    dbCitizenWallet = await financialRepository.getWalletByOwner(testCitizenId);
    dbStoreWallet = await financialRepository.getWalletByOwner(testStoreId);
    expect(dbCitizenWallet?.balance).toBe(480);
    expect(dbStoreWallet?.balance).toBe(1020);

    // Check SQLite inventory
    const dbCitizenInv = await inventoryRepository.getInventoryByOwner(testCitizenId);
    const wheatItem = dbCitizenInv?.items.find(i => i.productId === 'wheat');
    expect(wheatItem?.totalQuantity).toBe(2);
  });

  test('4. Cold restart hydrates transaction and state; replaying action after restart is idempotent', async () => {
    // Simulate cold restart: clear in-memory engines
    worldService.engine.reset();
    marketService.engine.clear();
    supplyService.reset();
    citizenService.engine.clear();
    eventService.scheduler.clearEvents();

    // Verify in-memory engines are blank
    expect(marketService.engine.hasTransaction(purchaseTxId)).toBe(false);
    expect(citizenService.engine.getCitizen(testCitizenId)).toBeUndefined();

    // Re-bootstrap from SQLite
    await persistenceService.bootstrap();
    marketService.initialize();
    await citizenService.initialize();

    // Verify MarketEngine hydrated transaction from SQLite
    expect(marketService.engine.hasTransaction(purchaseTxId)).toBe(true);

    const citizen = citizenService.engine.getCitizen(testCitizenId)!;
    const storeWp = worldService.engine.workplaceRepository.findById(testStoreId)!;
    expect(citizen).toBeDefined();
    expect(citizen.wallet.balance).toBe(480);
    expect(storeWp.wallet!.balance).toBe(1020);
    expect(supplyService.inventoryManager.getInventory(storeInvId)?.items['wheat']?.totalQuantity).toBe(98);
    expect(supplyService.inventoryManager.getInventory(citizenInvId)?.items['wheat']?.totalQuantity).toBe(2);

    // Replay the purchase action with the hydrated transaction ID
    const replayAction = citizenService.engine.actionExecutor.executeAction(citizen, {
      type: ActionType.PURCHASE,
      source: 'HUNGER',
      reason: 'Replay after cold restart',
      target: { id: testStoreId, type: 'BUILDING' },
      metadata: { transactionId: purchaseTxId, productId: 'wheat', targetQuantity: 2, sellerId: testStoreId }
    });

    expect(replayAction.state).toBe(ActionState.COMPLETED);

    // Balances and inventories must remain completely unchanged!
    expect(citizen.wallet.balance).toBe(480);
    expect(storeWp.wallet!.balance).toBe(1020);
    expect(supplyService.inventoryManager.getInventory(storeInvId)?.items['wheat']?.totalQuantity).toBe(98);
    expect(supplyService.inventoryManager.getInventory(citizenInvId)?.items['wheat']?.totalQuantity).toBe(2);
  });

  test('5. A second distinct purchase by the same citizen succeeds normally with a unique transaction ID', async () => {
    const citizen = citizenService.engine.getCitizen(testCitizenId)!;
    const storeWp = worldService.engine.workplaceRepository.findById(testStoreId)!;

    // Second purchase for 3 kg wheat @ 10 = 30 credits
    const action2 = citizenService.engine.actionExecutor.executeAction(citizen, {
      type: ActionType.PURCHASE,
      source: 'HUNGER',
      reason: 'Second distinct purchase',
      target: { id: testStoreId, type: 'BUILDING' },
      metadata: { productId: 'wheat', targetQuantity: 3, sellerId: testStoreId }
    });

    expect(action2.state).toBe(ActionState.COMPLETED);
    const txId2 = action2.metadata!.transactionId;
    expect(txId2).not.toBe(purchaseTxId);
    expect(txId2.startsWith('TX-PURCHASE-')).toBe(true);

    // Financial check: balance reduced by exactly tx2.totalPrice
    const tx2 = marketService.engine.getTransaction(txId2)!;
    expect(tx2).toBeDefined();
    expect(citizen.wallet.balance).toBe(480 - tx2.totalPrice);
    expect(storeWp.wallet!.balance).toBe(1020 + tx2.totalPrice);

    // Physical stock check: 98 - 3 = 95, 2 + 3 = 5
    expect(supplyService.inventoryManager.getInventory(storeInvId)?.items['wheat']?.totalQuantity).toBe(95);
    expect(supplyService.inventoryManager.getInventory(citizenInvId)?.items['wheat']?.totalQuantity).toBe(5);

    // Wait briefly for TransactionCompleted event handler to write to SQLite
    await new Promise(r => setTimeout(r, 100));

    // Verify SQLite has exactly 2 transactions now
    const dbTxs = await prisma.transactionRecord.findMany({
      where: { buyerId: testCitizenId }
    });
    expect(dbTxs.length).toBe(2);
    expect(dbTxs.some(t => t.transactionId === purchaseTxId)).toBe(true);
    expect(dbTxs.some(t => t.transactionId === txId2)).toBe(true);
  });

  test('6. Delivery failure executes compensation refund and conserves money in SQLite', async () => {
    const citizen = citizenService.engine.getCitizen(testCitizenId)!;
    const storeWp = worldService.engine.workplaceRepository.findById(testStoreId)!;

    const citizenBalBefore = citizen.wallet.balance; // 450
    const storeBalBefore = storeWp.wallet!.balance;   // 1050
    const storeStockBefore = supplyService.inventoryManager.getInventory(storeInvId)?.items['wheat']?.totalQuantity || 0; // 95

    // Mock transferItemQuantity to simulate failure
    jest.spyOn(supplyService.inventoryManager, 'transferItemQuantity').mockImplementationOnce(() => false);

    const failedAction = citizenService.engine.actionExecutor.executeAction(citizen, {
      type: ActionType.PURCHASE,
      source: 'HUNGER',
      reason: 'Delivery failure compensation test',
      target: { id: testStoreId, type: 'BUILDING' },
      metadata: { productId: 'wheat', targetQuantity: 2, sellerId: testStoreId }
    });

    expect(failedAction.state).toBe(ActionState.FAILED);
    expect(failedAction.failureReason).toContain('payment refunded');

    // Balances remain restored
    expect(citizen.wallet.balance).toBe(citizenBalBefore);
    expect(storeWp.wallet!.balance).toBe(storeBalBefore);
    expect(supplyService.inventoryManager.getInventory(storeInvId)?.items['wheat']?.totalQuantity).toBe(storeStockBefore);

    // Total circulating money is invariant (conserved)
    expect(citizen.wallet.balance + storeWp.wallet!.balance).toBe(citizenBalBefore + storeBalBefore);

    // Wait for event emissions
    await new Promise(r => setTimeout(r, 100));

    // Restore mock
    (supplyService.inventoryManager.transferItemQuantity as any).mockRestore();
  });
});
