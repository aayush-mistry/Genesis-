import { prisma } from '../../repositories/prisma';
import { worldService } from '../../services/world.service';
import { timeService } from '../../services/time.service';
import { eventService } from '../../services/event.service';
import { supplyService } from '../../services/supply.service';
import { marketService } from '../../services/market.service';
import { financeService } from '../../services/finance.service';
import { spatialService } from '../../services/spatial.service';
import { worldRepository } from '../../repositories/WorldRepository';
import { workplaceRepository } from '../../repositories/WorkplaceRepository';
import { inventoryRepository } from '../../repositories/InventoryRepository';
import { OrderStatus, ShipmentStatus, WorkplaceType } from '@genesis/shared';
import { TimeUtils } from '@genesis/engine';

describe('Project Genesis — T8.6.5.5: Cross-System Conservation & Cold-Restart Recovery', () => {
  jest.setTimeout(60000);

  const testSuffix = `t8655-${Date.now()}`;
  const worldId = `world-${testSuffix}`;
  const regionId = `reg-${testSuffix}`;
  const shopId = `shop-${testSuffix}`;
  const wholesaleId = `wholesale-${testSuffix}`;
  const shopInvId = `inv-${shopId}`;
  const wholesaleInvId = `inv-${wholesaleId}`;

  const cleanDatabase = async () => {
    await prisma.simulationEvent.deleteMany({ where: { sourceModule: { in: ['SupplyService', 'SupplyChainEngine', 'CommerceAutomation', 'BusinessProcurementEngine'] } } });
    await prisma.transactionRecord.deleteMany({ where: { regionId } });
    await prisma.shipment.deleteMany({ where: { originId: { in: [shopId, wholesaleId] } } });
    await prisma.order.deleteMany({ where: { buyerId: shopId } });
    await prisma.inventoryItem.deleteMany({ where: { inventoryId: { in: [shopInvId, wholesaleInvId] } } });
    await prisma.inventory.deleteMany({ where: { id: { in: [shopInvId, wholesaleInvId] } } });
    await prisma.wallet.deleteMany({ where: { ownerId: { in: [shopId, wholesaleId] } } });
    await prisma.workplace.deleteMany({ where: { id: { in: [shopId, wholesaleId] } } });
    await prisma.region.deleteMany({ where: { id: regionId } });
    await prisma.world.deleteMany({ where: { id: worldId } });
  };

  beforeAll(async () => {
    await cleanDatabase();

    // 1. Create World and Region
    await worldRepository.createWorld({
      id: worldId,
      name: `T8.6.5.5 Conservation World ${testSuffix}`,
      description: 'Conservation test world',
      randomSeed: 98765,
      creationTime: 1,
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
        id: regionId,
        name: `Region ${testSuffix}`,
        description: 'Test Region',
        climate: 'TEMPERATE',
        coordX: 0,
        coordY: 0,
        worldId
      }
    });

    worldService.engine.worldManager.loadWorld({
      id: worldId,
      name: `T8.6.5.5 Conservation World ${testSuffix}`,
      description: 'Conservation test world',
      randomSeed: 98765,
      creationTime: 1,
      worldSize: 1000,
      width: 1000,
      height: 1000,
      climateProfile: 'TEMPERATE',
      timeZone: 'UTC',
      version: '1.0.0',
      status: 'ACTIVE',
      regionIds: [regionId]
    } as any);

    const regionObj = {
      id: regionId,
      name: `Region ${testSuffix}`,
      description: 'Test Region',
      climate: 'TEMPERATE',
      population: 0,
      coordinates: { x: 0, y: 0 },
      width: 1000,
      height: 1000,
      worldId,
      cityIds: []
    };
    (worldService.engine.regionManager as any).regions.set(regionId, regionObj);

    // 2. Create Shop and Wholesale Workplaces
    await workplaceRepository.createWorkplace({
      id: shopId,
      type: WorkplaceType.SHOP,
      locationId: `loc-${shopId}`,
      regionId,
      capacity: 10,
      occupiedPositions: 0,
      vacancies: 10,
      inventoryId: shopInvId,
      storageCapacity: 2000,
      walletId: `wallet-${shopId}`,
      revenue: 0,
      expenses: 0,
      profit: 0,
      accountingHistoryJson: '[]'
    });

    await workplaceRepository.createWorkplace({
      id: wholesaleId,
      type: WorkplaceType.WHOLESALE,
      locationId: `loc-${wholesaleId}`,
      regionId,
      capacity: 50,
      occupiedPositions: 0,
      vacancies: 50,
      inventoryId: wholesaleInvId,
      storageCapacity: 5000,
      walletId: `wallet-${wholesaleId}`,
      revenue: 0,
      expenses: 0,
      profit: 0,
      accountingHistoryJson: '[]'
    });

    // 3. Create Wallets
    await prisma.wallet.create({
      data: {
        id: `wallet-${shopId}`,
        ownerId: shopId,
        balance: 5000,
        currency: 'GEN',
        totalIncome: 0,
        totalExpenses: 0
      }
    });

    await prisma.wallet.create({
      data: {
        id: `wallet-${wholesaleId}`,
        ownerId: wholesaleId,
        balance: 10000,
        currency: 'GEN',
        totalIncome: 0,
        totalExpenses: 0
      }
    });

    // 4. Create Inventories
    await inventoryRepository.createInventory({
      id: shopInvId,
      ownerId: shopId,
      storageCapacity: 2000
    });

    await inventoryRepository.createInventory({
      id: wholesaleInvId,
      ownerId: wholesaleId,
      storageCapacity: 5000
    });

    // Initialize Services
    worldService.initialize();
    marketService.initialize();
    supplyService.initialize();
    supplyService.setMarketEngine(marketService.engine);
    financeService.initialize();

    // Setup routes for spatial service
    jest.spyOn(spatialService.engine.queryService, 'calculateRoute').mockReturnValue({ path: [], distance: 10 });
  });

  const setupInMemoryWorkplaces = () => {
    if (!supplyService.inventoryManager.getInventory(shopInvId)) {
      supplyService.inventoryManager.createInventory(shopInvId, shopId, 2000);
    }
    if (!supplyService.inventoryManager.getInventory(wholesaleInvId)) {
      supplyService.inventoryManager.createInventory(wholesaleInvId, wholesaleId, 5000);
    }

    let shopWp = worldService.engine.workplaceRepository.findById(shopId);
    if (!shopWp) {
      shopWp = {
        id: shopId,
        type: WorkplaceType.SHOP,
        locationId: `loc-${shopId}`,
        regionId,
        capacity: 10,
        occupiedPositions: 0,
        vacancies: 10,
        positions: [],
        inventoryId: shopInvId,
        wallet: {
          id: `wallet-${shopId}`,
          ownerId: shopId,
          balance: 5000,
          currency: 'GEN',
          totalIncome: 0,
          totalExpenses: 0
        }
      };
      worldService.engine.workplaceRepository.create(shopWp);
    } else {
      shopWp.inventoryId = shopInvId;
      shopWp.wallet = {
        id: `wallet-${shopId}`,
        ownerId: shopId,
        balance: 5000,
        currency: 'GEN',
        totalIncome: 0,
        totalExpenses: 0
      };
    }

    let wholesaleWp = worldService.engine.workplaceRepository.findById(wholesaleId);
    if (!wholesaleWp) {
      wholesaleWp = {
        id: wholesaleId,
        type: WorkplaceType.WHOLESALE,
        locationId: `loc-${wholesaleId}`,
        regionId,
        capacity: 50,
        occupiedPositions: 0,
        vacancies: 50,
        positions: [],
        inventoryId: wholesaleInvId,
        wallet: {
          id: `wallet-${wholesaleId}`,
          ownerId: wholesaleId,
          balance: 10000,
          currency: 'GEN',
          totalIncome: 0,
          totalExpenses: 0
        }
      };
      worldService.engine.workplaceRepository.create(wholesaleWp);
    } else {
      wholesaleWp.inventoryId = wholesaleInvId;
      wholesaleWp.wallet = {
        id: `wallet-${wholesaleId}`,
        ownerId: wholesaleId,
        balance: 10000,
        currency: 'GEN',
        totalIncome: 0,
        totalExpenses: 0
      };
    }

    marketService.engine.registerWallet(shopWp.wallet!);
    marketService.engine.registerWallet(wholesaleWp.wallet!);
  };

  test('1. Inventory Spoilage: physical stock reduction, auditable transaction, financial conservation, and idempotency', async () => {
    setupInMemoryWorkplaces();
    timeService.engine.reset();
    const currentSimSec = TimeUtils.toSeconds(timeService.engine.getCurrentTime());

    // Setup shop inventory with 100 kg perishable wheat (expires at currentSimSec + 200)
    const expirySimSec = currentSimSec + 200;
    supplyService.inventoryManager.addItemQuantity(shopInvId, 'wheat', 100, 'kg', currentSimSec, expirySimSec, 10);

    const initialWallet = worldService.engine.workplaceRepository.findById(shopId)!.wallet!;
    expect(initialWallet.balance).toBe(5000);

    // Advance time past expiry
    timeService.engine.advanceTime(300); // Now at currentSimSec + 300
    const nowSec = TimeUtils.toSeconds(timeService.engine.getCurrentTime());

    // Execute spoilage removal
    const spoiledRecords = supplyService.inventoryManager.removeExpiredItems(nowSec);
    expect(spoiledRecords.length).toBe(1);
    expect(spoiledRecords[0].quantity).toBe(100);
    expect(spoiledRecords[0].productId).toBe('wheat');
    expect(spoiledRecords[0].totalLoss).toBe(1000);

    // Emit event as supply.service event handler does
    for (const record of spoiledRecords) {
      eventService.scheduler.emitter.emit('InventorySpoiled', record);
    }

    // Wait brief tick for async event listener in financeService
    await new Promise(r => setTimeout(r, 100));

    // Verify physical inventory is completely cleared
    const shopInv = supplyService.inventoryManager.getInventory(shopInvId)!;
    expect(shopInv.items['wheat']).toBeUndefined();

    // Verify FinancialEngine transaction record
    const expectedTxId = `TX-${spoiledRecords[0].id}`;
    const finTx = financeService.engine.ledger.getTransaction(expectedTxId);
    expect(finTx).toBeDefined();
    expect(finTx!.productId).toBe('wheat');
    expect(finTx!.totalPrice).toBe(1000);

    // Verify BusinessAccounting tracked the loss
    const workplace = worldService.engine.workplaceRepository.findById(shopId)!;
    financeService.engine.accounting.closeAccountingPeriod(shopId, 0, nowSec);
    expect(workplace.accounting!.history[0].spoilageLosses).toBe(1000);

    // Verify wallet balance is UNTOUCHED: exactly 5000 (no duplicate cash deduction!)
    expect(workplace.wallet!.balance).toBe(5000);

    // Verify database TransactionRecord was created
    let dbTx = null;
    for (let attempt = 0; attempt < 20; attempt++) {
      dbTx = await prisma.transactionRecord.findUnique({
        where: { transactionId: expectedTxId }
      });
      if (dbTx) break;
      await new Promise(r => setTimeout(r, 50));
    }
    expect(dbTx).not.toBeNull();
    expect(dbTx!.transactionType).toBe('INVENTORY_SPOILAGE');
    expect(dbTx!.totalPrice).toBe(1000);

    // Idempotency check: Re-running removal at same tick produces 0 removals and does not duplicate
    const secondRun = supplyService.inventoryManager.removeExpiredItems(nowSec);
    expect(secondRun.length).toBe(0);
    expect(workplace.wallet!.balance).toBe(5000);
  });

  test('2. Stalled Wholesale Order Recovery: cancels stalled PENDING order, refunds buyer, unblocks procurement', async () => {
    setupInMemoryWorkplaces();
    supplyService.supplyChainEngine.setOrderTimeoutSeconds(1000); // 1000 seconds

    const shopWp = worldService.engine.workplaceRepository.findById(shopId)!;
    const wholesaleWp = worldService.engine.workplaceRepository.findById(wholesaleId)!;

    const txId = `B2B-PROC-${testSuffix}-1`;
    // 1. Shop buys 50 kg wheat from wholesale for 1000 GEN
    const tx = marketService.engine.processTransaction(
      shopId, wholesaleId, 'wheat', 50, 'kg', 20, 1000, 'GEN',
      'RETAIL_PROCUREMENT' as any, regionId, txId
    );
    expect(tx).not.toBeNull();

    expect(shopWp.wallet!.balance).toBe(4000); // 5000 - 1000
    expect(wholesaleWp.wallet!.balance).toBe(11000); // 10000 + 1000

    // 2. Order created, but wholesale has 0 stock -> enters PENDING
    const orderId = `ORDER-${testSuffix}-1`;
    const order = supplyService.supplyChainEngine.createOrder(
      shopId, wholesaleId, 'wheat', 50, 'kg', orderId, false, txId, 20, 1000, 'GEN'
    );
    expect(order.status).toBe(OrderStatus.PENDING);
    await supplyService.supplyChainEngine.flushPersistence();

    // While pending, shop's pendingIncomingQuantity is 50
    expect(supplyService.supplyChainEngine.getPendingIncomingQuantity(shopId, 'wheat')).toBe(50);

    // 3. Advance time by 500s (< 1000s timeout): not eligible yet
    timeService.engine.advanceTime(500);
    const recoveredBefore = supplyService.supplyChainEngine.recoverStalledOrders();
    expect(recoveredBefore.length).toBe(0);
    expect(order.status).toBe(OrderStatus.PENDING);

    // 4. Advance time by another 600s (total age = 1100s > 1000s timeout): eligible!
    timeService.engine.advanceTime(600);
    const recoveredAfter = supplyService.supplyChainEngine.recoverStalledOrders();
    expect(recoveredAfter.length).toBe(1);
    expect(order.status).toBe(OrderStatus.CANCELLED);
    await supplyService.supplyChainEngine.flushPersistence();

    // 5. Verify refund: Shop balance restored to 5000, wholesale decremented to 10000
    expect(shopWp.wallet!.balance).toBe(5000);
    expect(wholesaleWp.wallet!.balance).toBe(10000);

    // 6. Verify procurement unblocked: pending incoming quantity dropped to 0!
    expect(supplyService.supplyChainEngine.getPendingIncomingQuantity(shopId, 'wheat')).toBe(0);

    // 7. Idempotency check: Re-running recovery does not re-refund
    supplyService.supplyChainEngine.recoverStalledOrders();
    expect(shopWp.wallet!.balance).toBe(5000);
    expect(wholesaleWp.wallet!.balance).toBe(10000);
  });

  test('3. Persistence and Cold Restart: preserves spoilage transactions and cancelled orders', async () => {
    // Flush and persist current state
    await supplyService.supplyChainEngine.flushPersistence();

    // Verify order was saved as CANCELLED in DB
    const dbOrder = await prisma.order.findUnique({
      where: { orderId: `ORDER-${testSuffix}-1` }
    });
    expect(dbOrder).not.toBeNull();
    expect(dbOrder!.status).toBe('CANCELLED');

    // Verify spoilage records exist in DB
    const spoilageTxs = await prisma.transactionRecord.findMany({
      where: { referenceType: 'INVENTORY_SPOILAGE', regionId }
    });
    expect(spoilageTxs.length).toBeGreaterThan(0);

    // Simulate Cold Restart: clear in-memory maps
    supplyService.supplyChainEngine.clear();
    marketService.engine.clear();
    supplyService.spoilageLedger.clear();

    expect(supplyService.supplyChainEngine.getAllOrders().length).toBe(0);

    // Hydrate orders and transactions from DB via CommerceRepository
    const { commerceRepository } = await import('../../repositories/CommerceRepository');
    const allOrders = await commerceRepository.listAllOrders();
    supplyService.supplyChainEngine.loadOrders(allOrders);

    const dbTransactions = await prisma.transactionRecord.findMany({ where: { regionId } });
    marketService.engine.loadTransactions(dbTransactions.map(tx => ({
      transactionId: tx.transactionId,
      timestamp: tx.timestamp,
      buyerId: tx.buyerId,
      sellerId: tx.sellerId,
      productId: tx.productId,
      quantity: tx.quantity,
      unit: tx.unit,
      unitPrice: tx.unitPrice,
      totalPrice: tx.totalPrice,
      currency: tx.currency,
      transactionType: tx.transactionType as any,
      regionId: tx.regionId,
      description: tx.description ?? undefined,
      referenceId: tx.referenceId ?? undefined,
      referenceType: tx.referenceType ?? undefined
    })));

    // Verify order is hydrated with CANCELLED status
    const hydratedOrder = supplyService.supplyChainEngine.getOrder(`ORDER-${testSuffix}-1`);
    expect(hydratedOrder).toBeDefined();
    expect(hydratedOrder!.status).toBe(OrderStatus.CANCELLED);

    // Verify running recovery on restart is completely safe
    const recovered = supplyService.supplyChainEngine.recoverStalledOrders();
    expect(recovered.length).toBe(0);
  });

  test('4. Late Arrival Safety: late arrival on cancelled order safely returns goods without duplicating refund', async () => {
    setupInMemoryWorkplaces();
    // Add stock to wholesale
    supplyService.inventoryManager.addItemQuantity(wholesaleInvId, 'wheat', 50, 'kg');

    const txId = `B2B-PROC-${testSuffix}-late`;
    marketService.engine.processTransaction(shopId, wholesaleId, 'wheat', 50, 'kg', 10, 500, 'GEN', 'RETAIL_PROCUREMENT' as any, regionId, txId);

    const orderId = `ORDER-${testSuffix}-late`;
    const order = supplyService.supplyChainEngine.createOrder(shopId, wholesaleId, 'wheat', 50, 'kg', orderId, false, txId, 10, 500, 'GEN');
    expect(order.status).toBe(OrderStatus.DISPATCHED);
    const shipmentId = order.shipmentId!;

    // Cancel order before arrival (simulate timeout recovery)
    order.status = OrderStatus.CANCELLED;
    marketService.engine.reverseTransaction(txId, `${txId}-REV-TIMEOUT`, 'Simulated cancellation');

    const shopWp = worldService.engine.workplaceRepository.findById(shopId)!;
    const wholesaleWp = worldService.engine.workplaceRepository.findById(wholesaleId)!;
    const initialShopBalance = shopWp.wallet!.balance;
    const initialWholesaleBalance = wholesaleWp.wallet!.balance;

    // Late arrival arrives!
    await supplyService.supplyChainEngine.handleShipmentArrival({ shipmentId, orderId });

    // Shipment cancelled, order stays CANCELLED
    const shipment = supplyService.supplyChainEngine.getShipment(shipmentId)!;
    expect(shipment.status).toBe(ShipmentStatus.CANCELLED);
    expect(order.status).toBe(OrderStatus.CANCELLED);

    // Goods returned to wholesale warehouse
    const wholesaleInv = supplyService.inventoryManager.getInventory(wholesaleInvId)!;
    expect(wholesaleInv.items['wheat'].totalQuantity).toBe(50);

    // No goods delivered to shop
    const shopInv = supplyService.inventoryManager.getInventory(shopInvId);
    expect(shopInv?.items['wheat']).toBeUndefined();

    // No duplicate refund
    expect(shopWp.wallet!.balance).toBe(initialShopBalance);
    expect(wholesaleWp.wallet!.balance).toBe(initialWholesaleBalance);
  });

  afterAll(async () => {
    eventService.scheduler.clearEvents();
    await supplyService.supplyChainEngine.flushPersistence();
    await new Promise(r => setTimeout(r, 150));
    await cleanDatabase();
  });
});
