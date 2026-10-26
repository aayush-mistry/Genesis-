import * as path from 'path';
import * as fs from 'fs';

// Set up isolated database BEFORE any database/service imports
const isolatedDbName = 'isolated_transport_treasury.db';
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
import { spatialService } from '../../services/spatial.service';
import { financialRepository } from '../../repositories/FinancialRepository';
import { worldRepository } from '../../repositories/WorldRepository';
import { SYSTEM_TRANSPORT_ID, TRANSPORT_TREASURY_WALLET_ID } from '@genesis/engine';
import { WorkplaceType, OrderStatus } from '@genesis/shared';

describe('T8.6.6.3 — Transport Treasury Persistence & Cold-Restart Recovery Integration', () => {
  jest.setTimeout(60000);

  const testWorldId = 'test-world-transport-treasury';
  const testRegionId = 'test-region-transport-treasury';
  const buyerId = 'shop-treasury-pers';
  const sellerId = 'wholesale-treasury-pers';
  const buyerInvId = `inv-${buyerId}`;
  const sellerInvId = `inv-${sellerId}`;

  const initialBuyerBal = 60000;
  const initialSellerBal = 10000;
  let buyerWallet: any;
  let sellerWallet: any;

  beforeAll(async () => {
    // 1. Clean isolated database
    await prisma.transactionRecord.deleteMany();
    await prisma.shipment.deleteMany();
    await prisma.order.deleteMany();
    await prisma.inventoryItem.deleteMany();
    await prisma.inventory.deleteMany();
    await prisma.wallet.deleteMany();
    await prisma.workplace.deleteMany();
    await prisma.region.deleteMany();
    await prisma.world.deleteMany();
    await prisma.simulationState.deleteMany();
    await prisma.simulationEvent.deleteMany();

    // 2. Setup simulation state and world
    await prisma.simulationState.create({
      data: { id: 'singleton', activeWorldId: testWorldId, year: 1, month: 1, day: 1, speed: 1 }
    });

    await worldRepository.createWorld({
      id: testWorldId,
      name: 'Transport Treasury World',
      description: 'World for transport treasury persistence integration tests',
      randomSeed: 554433,
      creationTime: 0,
      worldSize: 1000,
      width: 1000,
      height: 1000,
      climateProfile: 'TEMPERATE',
      timeZone: 'UTC',
      version: '1.0.0',
      status: 'ACTIVE'
    });

    await prisma.region.create({
      data: {
        id: testRegionId,
        worldId: testWorldId,
        name: 'Transport Treasury Region',
        description: 'Transport Treasury Region Description',
        climate: 'TEMPERATE',
        coordX: 0,
        coordY: 0,
        width: 1000,
        height: 1000
      }
    });

    buyerWallet = {
      id: `wallet-${buyerId}`,
      ownerId: buyerId,
      balance: initialBuyerBal,
      currency: 'GEN',
      totalIncome: 0,
      totalExpenses: 0
    };

    sellerWallet = {
      id: `wallet-${sellerId}`,
      ownerId: sellerId,
      balance: initialSellerBal,
      currency: 'GEN',
      totalIncome: 0,
      totalExpenses: 0
    };

    // Create DB wallets and workplaces
    await prisma.wallet.createMany({
      data: [
        { id: buyerWallet.id, ownerId: buyerId, balance: initialBuyerBal, currency: 'GEN' },
        { id: sellerWallet.id, ownerId: sellerId, balance: initialSellerBal, currency: 'GEN' }
      ]
    });

    await prisma.workplace.createMany({
      data: [
        {
          id: buyerId,
          regionId: testRegionId,
          type: WorkplaceType.SHOP,
          locationId: `loc-${buyerId}`,
          capacity: 10,
          occupiedPositions: 0,
          vacancies: 10,
          revenue: 0,
          expenses: 0,
          profit: 0,
          inventoryId: buyerInvId,
          walletId: buyerWallet.id
        },
        {
          id: sellerId,
          regionId: testRegionId,
          type: WorkplaceType.WHOLESALE,
          locationId: `loc-${sellerId}`,
          capacity: 10,
          occupiedPositions: 0,
          vacancies: 10,
          revenue: 0,
          expenses: 0,
          profit: 0,
          inventoryId: sellerInvId,
          walletId: sellerWallet.id
        }
      ]
    });

    // 3. Initialize in-memory services
    worldService.engine.reset();
    marketService.initialize();
    supplyService.reset();

    // Setup inventory & stock
    supplyService.inventoryManager.createInventory(buyerInvId, buyerId, 2000);
    supplyService.inventoryManager.createInventory(sellerInvId, sellerId, 2000);
    supplyService.inventoryManager.addItemQuantity(sellerInvId, 'wheat', 500, 'kg');

    worldService.engine.workplaceRepository.create({
      id: buyerId,
      type: WorkplaceType.SHOP,
      regionId: testRegionId,
      locationId: `loc-${buyerId}`,
      capacity: 10,
      occupiedPositions: 0,
      vacancies: 10,
      positions: [],
      inventoryId: buyerInvId,
      storageCapacity: 2000,
      wallet: buyerWallet,
      inventoryConfiguration: {
        wheat: { reorderPoint: 50, targetStock: 200 }
      }
    });

    worldService.engine.workplaceRepository.create({
      id: sellerId,
      type: WorkplaceType.WHOLESALE,
      regionId: testRegionId,
      locationId: `loc-${sellerId}`,
      capacity: 10,
      occupiedPositions: 0,
      vacancies: 10,
      positions: [],
      inventoryId: sellerInvId,
      storageCapacity: 2000,
      wallet: sellerWallet
    });

    // Mock distance: 10 units -> 200 kg * 10 * 0.1 = 200 GEN transport fee
    jest.spyOn(spatialService.engine.queryService, 'calculateRoute').mockReturnValue({ distance: 10 } as any);
  });

  afterAll(async () => {
    await prisma.$disconnect();
    // Clean up isolated test database files
    try {
      if (fs.existsSync(isolatedDbPath)) fs.unlinkSync(isolatedDbPath);
      const journal = `${isolatedDbPath}-journal`;
      if (fs.existsSync(journal)) fs.unlinkSync(journal);
    } catch (_) {
      // Ignore cleanup error
    }
  });

  test('1. B2B procurement executes, credits transport treasury, and persists balance to database', async () => {
    const treasury = marketService.engine.getTransportTreasuryWallet();
    expect(treasury.balance).toBe(0);

    // Run procurement cycle
    supplyService.businessProcurementEngine.runProcurementCycle();

    const orders = supplyService.supplyChainEngine.getOrdersForBusiness(buyerId);
    expect(orders.length).toBe(1);
    const order = orders[0];
    const purchaseTx = marketService.engine.getTransaction(order.transactionId!);
    expect(purchaseTx).toBeDefined();
    const purchasePrice = purchaseTx!.totalPrice;

    // Verify treasury received 200 GEN transport fee
    expect(treasury.balance).toBe(200);

    // Verify buyer debited (goods: purchasePrice + transport: 200)
    expect(buyerWallet.balance).toBe(initialBuyerBal - purchasePrice - 200);
    expect(sellerWallet.balance).toBe(initialSellerBal + purchasePrice);
    expect(buyerWallet.balance + sellerWallet.balance + treasury.balance).toBe(initialBuyerBal + initialSellerBal);

    // Persist tick boundary to SQLite
    await persistenceService.persistTickBoundary();

    // Verify DB contains SYSTEM_TRANSPORT wallet with exact balance of 200
    const dbTreasury = await financialRepository.getWalletByOwner(SYSTEM_TRANSPORT_ID);
    expect(dbTreasury).not.toBeNull();
    expect(dbTreasury!.ownerId).toBe(SYSTEM_TRANSPORT_ID);
    expect(dbTreasury!.balance).toBe(200);
    expect(dbTreasury!.currency).toBe('GEN');
    expect(dbTreasury!.totalIncome).toBe(200);
  });

  test('2. Multiple persistence ticks do not overwrite or reset the treasury balance', async () => {
    const treasury = marketService.engine.getTransportTreasuryWallet();
    expect(treasury.balance).toBe(200);

    // Tick 1
    await persistenceService.persistTickBoundary();
    let dbTreasury = await financialRepository.getWalletByOwner(SYSTEM_TRANSPORT_ID);
    expect(dbTreasury?.balance).toBe(200);

    // Tick 2
    await persistenceService.persistTickBoundary();
    dbTreasury = await financialRepository.getWalletByOwner(SYSTEM_TRANSPORT_ID);
    expect(dbTreasury?.balance).toBe(200);

    // Tick 3
    await persistenceService.persistTickBoundary();
    dbTreasury = await financialRepository.getWalletByOwner(SYSTEM_TRANSPORT_ID);
    expect(dbTreasury?.balance).toBe(200);

    // In-memory balance untouched
    expect(treasury.balance).toBe(200);
  });

  test('3. Cold restart hydrates the transport treasury wallet with exact persisted balance', async () => {
    // Simulate cold restart: clear in-memory singletons
    marketService.engine.clear();
    supplyService.supplyChainEngine.clear();
    worldService.engine.reset();

    // Before hydration, a freshly created engine has 0
    expect(marketService.engine.getTransportTreasuryWallet().balance).toBe(0);

    // Re-bootstrap from database
    await persistenceService.bootstrap();

    // Authoritative in-memory treasury must match persisted 200 balance!
    const hydratedTreasury = marketService.engine.getTransportTreasuryWallet();
    expect(hydratedTreasury).toBeDefined();
    expect(hydratedTreasury.ownerId).toBe(SYSTEM_TRANSPORT_ID);
    expect(hydratedTreasury.balance).toBe(200);
    expect(hydratedTreasury.totalIncome).toBe(200);

    // Lookup via getWallet('SYSTEM_TRANSPORT') and getWallet('wallet-system-transport')
    expect(marketService.engine.getWallet(SYSTEM_TRANSPORT_ID)?.balance).toBe(200);
  });

  test('4. Order cancellation after restart debits the hydrated treasury and strictly conserves money', async () => {
    const shopWp = worldService.engine.workplaceRepository.findById(buyerId);
    const wholesaleWp = worldService.engine.workplaceRepository.findById(sellerId);
    expect(shopWp).toBeDefined();
    expect(wholesaleWp).toBeDefined();

    const orders = supplyService.supplyChainEngine.getAllOrders();
    expect(orders.length).toBe(1);
    const order = orders[0];

    const treasury = marketService.engine.getTransportTreasuryWallet();
    expect(treasury.balance).toBe(200);

    // Cancel order via timeout cancellation
    order.status = OrderStatus.PENDING;
    order.shipmentId = undefined;
    supplyService.supplyChainEngine.setOrderTimeoutSeconds(10);
    timeService.engine.advanceTime(100);

    const recovered = supplyService.supplyChainEngine.recoverStalledOrders();
    expect(recovered.length).toBe(1);
    expect(order.status).toBe(OrderStatus.CANCELLED);

    // Reversal must debit the treasury by 200 and refund the buyer by purchasePrice + 200
    expect(treasury.balance).toBe(0);
    expect(shopWp!.wallet!.balance).toBe(initialBuyerBal);
    expect(wholesaleWp!.wallet!.balance).toBe(initialSellerBal);

    // Total money conservation
    const totalMoney = shopWp!.wallet!.balance + wholesaleWp!.wallet!.balance + treasury.balance;
    expect(totalMoney).toBe(initialBuyerBal + initialSellerBal);

    // Persist tick boundary again
    await persistenceService.persistTickBoundary();

    // In DB: treasury balance is updated to 0
    const dbTreasury = await financialRepository.getWalletByOwner(SYSTEM_TRANSPORT_ID);
    expect(dbTreasury?.balance).toBe(0);
  });
});
