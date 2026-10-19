import { prisma } from '../../repositories/prisma';
import { worldService } from '../../services/world.service';
import { timeService } from '../../services/time.service';
import { eventService } from '../../services/event.service';
import { spatialService } from '../../services/spatial.service';
import { supplyService } from '../../services/supply.service';
import { marketService } from '../../services/market.service';
import { persistenceService } from '../../services/persistence.service';
import { worldRepository } from '../../repositories/WorldRepository';
import { workplaceRepository } from '../../repositories/WorkplaceRepository';
import { inventoryRepository } from '../../repositories/InventoryRepository';
import { financialRepository } from '../../repositories/FinancialRepository';
import { commerceRepository } from '../../repositories/CommerceRepository';
import { simulationRepository } from '../../repositories/SimulationRepository';
import { OrderStatus, ShipmentStatus, WorkplaceType } from '@genesis/shared';
import { TimeEngine } from '@genesis/engine';

describe('Project Genesis — T8.6.5.2: Supply Chain Persistence & Cold-Restart Recovery', () => {
  jest.setTimeout(60000);

  const worldId = 'test-world-supply-pers';
  const regionId = 'test-reg-supply-pers';
  const buyerId = 'test-buyer-shop-1';
  const sellerId = 'test-seller-farm-1';
  const buyerInvId = `inv-${buyerId}`;
  const sellerInvId = `inv-${sellerId}`;

  const cleanDatabase = async () => {
    await prisma.simulationEvent.deleteMany();
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
  };

  const setupWorldAndWorkplaces = async () => {
    // 1. Create World in DB and in memory
    await worldRepository.createWorld({
      id: worldId,
      name: 'Supply Chain World',
      description: 'World for supply chain persistence tests',
      randomSeed: 12345,
      creationTime: 1,
      worldSize: 1000,
      width: 1000,
      height: 1000,
      climateProfile: 'TEMPERATE',
      timeZone: 'UTC',
      version: '1.0.0',
      status: 'ACTIVE'
    });

    worldService.engine.worldManager.loadWorld({
      id: worldId,
      name: 'Supply Chain World',
      description: 'World for supply chain persistence tests',
      randomSeed: 12345,
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

    // 2. Create Region in DB and in memory
    await prisma.region.create({
      data: {
        id: regionId,
        name: 'Supply Region',
        description: 'Test Region',
        climate: 'TEMPERATE',
        population: 0,
        coordX: 0,
        coordY: 0,
        width: 1000,
        height: 1000,
        worldId
      }
    });

    const regionObj = {
      id: regionId,
      name: 'Supply Region',
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

    // 3. Create Seller Workplace (Farm), Inventory (500kg wheat), and Wallet
    await workplaceRepository.createWorkplace({
      id: sellerId,
      type: 'FARM',
      locationId: 'loc-seller',
      regionId,
      capacity: 10,
      occupiedPositions: 10,
      vacancies: 0,
      inventoryId: sellerInvId,
      storageCapacity: 2000,
      walletId: `wallet-${sellerId}`,
      revenue: 0,
      expenses: 0,
      profit: 0
    });

    await inventoryRepository.createInventory({
      id: sellerInvId,
      ownerId: sellerId,
      storageCapacity: 2000
    });
    await inventoryRepository.setItemExactQuantity(sellerInvId, 'wheat', 500, 'kg');

    await financialRepository.createWallet(sellerId, 'GEN');
    await financialRepository.updateWallet(sellerId, 5000, 0, 0);

    // 4. Create Buyer Workplace (Shop), Inventory (empty, capacity 2000), and Wallet
    await workplaceRepository.createWorkplace({
      id: buyerId,
      type: 'SHOP',
      locationId: 'loc-buyer',
      regionId,
      capacity: 10,
      occupiedPositions: 10,
      vacancies: 0,
      inventoryId: buyerInvId,
      storageCapacity: 2000,
      walletId: `wallet-${buyerId}`,
      revenue: 0,
      expenses: 0,
      profit: 0
    });

    await inventoryRepository.createInventory({
      id: buyerInvId,
      ownerId: buyerId,
      storageCapacity: 2000
    });

    await financialRepository.createWallet(buyerId, 'GEN');
    await financialRepository.updateWallet(buyerId, 10000, 0, 0);

    // Sync in-memory simulation time
    const initialTime = { year: 1, month: 1, day: 1, hour: 8, minute: 0, second: 0 };
    timeService.engine.setCurrentTime(initialTime);
    timeService.engine.setSpeed(1);
    await simulationRepository.upsertSimulationState(initialTime, 1, worldId);
  };

  beforeEach(async () => {
    await cleanDatabase();
    worldService.engine.reset();
    marketService.reset();
    timeService.engine.reset();
    supplyService.reset();
    eventService.scheduler.clearEvents();
    await setupWorldAndWorkplaces();

    // Deterministic route distance: 80 units -> 1 hour travel time (3600 seconds)
    jest.spyOn(spatialService.engine.queryService, 'calculateRoute').mockReturnValue({
      path: [],
      distance: 80
    } as any);
  });

  afterAll(async () => {
    await cleanDatabase();
  });

  it('1. Order and shipment serialization and hydration to and from SQLite', async () => {
    // Bootstrap in-memory state from database
    await persistenceService.bootstrap();

    // Place order
    const order = supplyService.supplyChainEngine.createOrder(
      buyerId,
      sellerId,
      'wheat',
      100,
      'kg',
      'ORDER-TEST-SERIALIZE',
      false,
      'TX-TEST-SERIALIZE',
      10,
      1000,
      'GEN'
    );

    expect(order.status).toBe(OrderStatus.DISPATCHED);
    expect(order.shipmentId).toBeDefined();

    // Flush any pending async storage adapter operations before asserting against DB
    await supplyService.supplyChainEngine.flushPersistence();

    // Verify immediately written to SQLite via CommerceRepository
    const dbOrder = await commerceRepository.getOrder(order.orderId);
    expect(dbOrder).not.toBeNull();
    expect(dbOrder!.orderId).toBe('ORDER-TEST-SERIALIZE');
    expect(dbOrder!.status).toBe(OrderStatus.DISPATCHED);
    expect(dbOrder!.quantity).toBe(100);
    expect(dbOrder!.transactionId).toBe('TX-TEST-SERIALIZE');
    expect(dbOrder!.unitPrice).toBe(10);
    expect(dbOrder!.totalPrice).toBe(1000);

    const dbShipment = await commerceRepository.getShipment(order.shipmentId!);
    expect(dbShipment).not.toBeNull();
    expect(dbShipment!.originId).toBe(sellerId);
    expect(dbShipment!.destinationId).toBe(buyerId);
    expect(dbShipment!.productId).toBe('wheat');
    expect(dbShipment!.quantity).toBe(100);
    expect(dbShipment!.status).toBe(ShipmentStatus.IN_TRANSIT);
    expect(dbShipment!.orderId).toBe(order.orderId);

    // Wipe in-memory SupplyChainEngine
    supplyService.supplyChainEngine.clear();
    expect(supplyService.supplyChainEngine.getAllOrders().length).toBe(0);
    expect(supplyService.supplyChainEngine.getAllActiveShipments().length).toBe(0);

    // Bootstrap again from SQLite
    await persistenceService.bootstrap();

    // Verify reconstructed in-memory state matches SQLite
    const restoredOrder = supplyService.supplyChainEngine.getOrder(order.orderId);
    expect(restoredOrder).toBeDefined();
    expect(restoredOrder!.orderId).toBe(order.orderId);
    expect(restoredOrder!.buyerId).toBe(buyerId);
    expect(restoredOrder!.sellerId).toBe(sellerId);
    expect(restoredOrder!.quantity).toBe(100);
    expect(restoredOrder!.status).toBe(OrderStatus.DISPATCHED);
    expect(restoredOrder!.transactionId).toBe('TX-TEST-SERIALIZE');

    const restoredShipment = supplyService.supplyChainEngine.getShipment(order.shipmentId!);
    expect(restoredShipment).toBeDefined();
    expect(restoredShipment!.shipmentId).toBe(order.shipmentId);
    expect(restoredShipment!.originId).toBe(sellerId);
    expect(restoredShipment!.destinationId).toBe(buyerId);
    expect(restoredShipment!.status).toBe(ShipmentStatus.IN_TRANSIT);
  });

  it('2. Full lifecycle: Dispatch -> Cold Restart during transit -> Advance to arrival -> Goods deliver exactly once', async () => {
    await persistenceService.bootstrap();

    // Initial seller stock: 500kg
    const initialSellerInv = supplyService.inventoryManager.getInventory(sellerInvId)!;
    expect(initialSellerInv.items['wheat'].totalQuantity).toBe(500);

    // Process real B2B procurement payment through MarketEngine
    const orderQuantity = 200;
    const unitPrice = 10;
    const totalPrice = 2000;
    const txId = 'B2B-PROC-LIFECYCLE-1';

    const tx = marketService.engine.processTransaction(
      buyerId,
      sellerId,
      'wheat',
      orderQuantity,
      'kg',
      unitPrice,
      totalPrice,
      'GEN',
      'RETAIL_PROCUREMENT' as any,
      regionId,
      txId
    );
    expect(tx).not.toBeNull();

    // Verify buyer and seller balances after payment
    expect(marketService.engine.getWallet(buyerId)!.balance).toBe(8000); // 10000 - 2000
    expect(marketService.engine.getWallet(sellerId)!.balance).toBe(7000); // 5000 + 2000

    // Create and dispatch order with preReserved = false
    const order = supplyService.supplyChainEngine.createOrder(
      buyerId,
      sellerId,
      'wheat',
      orderQuantity,
      'kg',
      'ORDER-LIFECYCLE-1',
      false,
      txId,
      unitPrice,
      totalPrice,
      'GEN'
    );

    expect(order.status).toBe(OrderStatus.DISPATCHED);
    const shipmentId = order.shipmentId!;
    expect(shipmentId).toBeDefined();

    // Seller inventory deducted into transit: 500 - 200 = 300
    expect(initialSellerInv.items['wheat'].totalQuantity).toBe(300);

    // Buyer has received nothing yet
    const buyerInvBeforeArrival = supplyService.inventoryManager.getInventory(buyerInvId);
    expect(buyerInvBeforeArrival?.items['wheat']?.totalQuantity || 0).toBe(0);

    // Persist tick boundary before crash
    await persistenceService.persistTickBoundary();

    // -------------------------------------------------------------
    // COLD RESTART: Simulate backend shutdown and fresh process start
    // -------------------------------------------------------------
    worldService.engine.reset();
    marketService.reset();
    timeService.engine.reset();
    supplyService.reset();
    eventService.scheduler.clearEvents();

    // Bootstrap everything from SQLite
    await persistenceService.bootstrap();

    // Verify restored state in fresh engine
    const restoredOrder = supplyService.supplyChainEngine.getOrder('ORDER-LIFECYCLE-1');
    expect(restoredOrder).toBeDefined();
    expect(restoredOrder!.status).toBe(OrderStatus.DISPATCHED);

    const restoredShipment = supplyService.supplyChainEngine.getShipment(shipmentId);
    expect(restoredShipment).toBeDefined();
    expect(restoredShipment!.status).toBe(ShipmentStatus.IN_TRANSIT);

    // Verify pending arrival event exists in scheduler
    const upcomingEvents = eventService.scheduler.getUpcomingEvents();
    const arrivalEvent = upcomingEvents.find(e => e.id === `shipment-${shipmentId}`);
    expect(arrivalEvent).toBeDefined();
    expect(arrivalEvent!.handlerName).toBe('SupplyChainEngine.handleShipmentArrival');

    // Restored inventories in transit state
    const restoredSellerInv = supplyService.inventoryManager.getInventory(sellerInvId)!;
    expect(restoredSellerInv.items['wheat'].totalQuantity).toBe(300);

    const restoredBuyerInv = supplyService.inventoryManager.getInventory(buyerInvId)!;
    expect(restoredBuyerInv.items['wheat']?.totalQuantity || 0).toBe(0);

    // Advance simulation time by 3600 seconds to trigger shipment arrival
    timeService.engine.advance(3600);
    await eventService.scheduler.executeDueEvents(timeService.engine.getCurrentTime());

    // -------------------------------------------------------------
    // VERIFY DELIVERY EXACTLY ONCE
    // -------------------------------------------------------------
    expect(restoredShipment!.status).toBe(ShipmentStatus.DELIVERED);
    expect(restoredOrder!.status).toBe(OrderStatus.DELIVERED);

    // Goods delivered to buyer
    expect(restoredBuyerInv.items['wheat'].totalQuantity).toBe(200);
    expect(restoredBuyerInv.items['wheat'].availableQuantity).toBe(200);

    // Seller inventory remains 300
    expect(restoredSellerInv.items['wheat'].totalQuantity).toBe(300);

    // Total goods conservation: 300 (seller) + 200 (buyer) = 500 (initial total)
    expect(restoredSellerInv.items['wheat'].totalQuantity + restoredBuyerInv.items['wheat'].totalQuantity).toBe(500);

    // Database records updated
    const finalDbShipment = await commerceRepository.getShipment(shipmentId);
    expect(finalDbShipment!.status).toBe(ShipmentStatus.DELIVERED);

    const finalDbOrder = await commerceRepository.getOrder('ORDER-LIFECYCLE-1');
    expect(finalDbOrder!.status).toBe(OrderStatus.DELIVERED);
  });

  it('3. Shipment failure after cold restart: executes refund and goods recovery exactly once', async () => {
    await persistenceService.bootstrap();

    // Process payment and dispatch order
    const orderQuantity = 150;
    const unitPrice = 10;
    const totalPrice = 1500;
    const txId = 'B2B-PROC-FAILURE-RECOVER';

    marketService.engine.processTransaction(
      buyerId,
      sellerId,
      'wheat',
      orderQuantity,
      'kg',
      unitPrice,
      totalPrice,
      'GEN',
      'RETAIL_PROCUREMENT' as any,
      regionId,
      txId
    );

    const order = supplyService.supplyChainEngine.createOrder(
      buyerId,
      sellerId,
      'wheat',
      orderQuantity,
      'kg',
      'ORDER-FAIL-1',
      false,
      txId,
      unitPrice,
      totalPrice,
      'GEN'
    );

    const shipmentId = order.shipmentId!;
    expect(order.status).toBe(OrderStatus.DISPATCHED);

    // Seller goods in transit
    expect(supplyService.inventoryManager.getInventory(sellerInvId)!.items['wheat'].totalQuantity).toBe(350); // 500 - 150

    await persistenceService.persistTickBoundary();

    // -------------------------------------------------------------
    // COLD RESTART
    // -------------------------------------------------------------
    worldService.engine.reset();
    marketService.reset();
    timeService.engine.reset();
    supplyService.reset();
    eventService.scheduler.clearEvents();

    await persistenceService.bootstrap();

    // Make buyer inventory full to cause delivery failure
    const buyerInv = supplyService.inventoryManager.getInventory(buyerInvId)!;
    buyerInv.storageCapacity = 0; // Unable to accept any delivery

    // Advance to arrival
    timeService.engine.advance(3600);
    await eventService.scheduler.executeDueEvents(timeService.engine.getCurrentTime());

    // -------------------------------------------------------------
    // VERIFY FAILURE & GOODS RECOVERY & REFUND
    // -------------------------------------------------------------
    const failedShipment = supplyService.supplyChainEngine.getShipment(shipmentId);
    const failedOrder = supplyService.supplyChainEngine.getOrder('ORDER-FAIL-1');

    expect(failedShipment!.status).toBe(ShipmentStatus.FAILED);
    expect(failedOrder!.status).toBe(OrderStatus.FAILED);

    // Goods recovered to seller warehouse
    const sellerInv = supplyService.inventoryManager.getInventory(sellerInvId)!;
    expect(sellerInv.items['wheat'].totalQuantity).toBe(500); // Restored!

    // Buyer received 0 goods
    expect(buyerInv.items['wheat']?.totalQuantity || 0).toBe(0);

    // Buyer refunded via MarketEngine reversal
    expect(marketService.engine.getWallet(buyerId)!.balance).toBe(10000); // 10000 refunded
    expect(marketService.engine.getWallet(sellerId)!.balance).toBe(5000);  // Decremented back to 5000

    // Reversal transaction recorded
    const reversalTx = marketService.engine.getTransaction(`${txId}-REV-ARRIVAL`);
    expect(reversalTx).toBeDefined();
    expect(reversalTx!.referenceId).toBe(txId);

    // Verify DB reflects failure
    const dbShipment = await commerceRepository.getShipment(shipmentId);
    expect(dbShipment!.status).toBe(ShipmentStatus.FAILED);

    const dbOrder = await commerceRepository.getOrder('ORDER-FAIL-1');
    expect(dbOrder!.status).toBe(OrderStatus.FAILED);
  });

  it('4. Repeated bootstrap and repeated arrival events (Idempotency)', async () => {
    await persistenceService.bootstrap();

    const order = supplyService.supplyChainEngine.createOrder(
      buyerId,
      sellerId,
      'wheat',
      100,
      'kg',
      'ORDER-IDEMPOTENT-1',
      false,
      'TX-IDEMPOTENT-1'
    );
    const shipmentId = order.shipmentId!;
    await persistenceService.persistTickBoundary();

    // First Cold Restart
    await persistenceService.bootstrap();

    // Second Cold Restart immediately
    await persistenceService.bootstrap();

    // Verify no duplicates
    const allOrders = supplyService.supplyChainEngine.getAllOrders().filter(o => o.orderId === 'ORDER-IDEMPOTENT-1');
    expect(allOrders.length).toBe(1);

    const upcomingEvents = eventService.scheduler.getUpcomingEvents().filter(e => e.id === `shipment-${shipmentId}`);
    expect(upcomingEvents.length).toBe(1); // Not duplicated!

    // Advance to arrival
    timeService.engine.advance(3600);
    await eventService.scheduler.executeDueEvents(timeService.engine.getCurrentTime());

    // Delivery succeeded
    const buyerInv = supplyService.inventoryManager.getInventory(buyerInvId)!;
    expect(buyerInv.items['wheat'].totalQuantity).toBe(100);

    // Replay arrival event directly
    await supplyService.supplyChainEngine.handleShipmentArrival({
      shipmentId,
      orderId: 'ORDER-IDEMPOTENT-1'
    });

    // Goods NOT duplicated
    expect(buyerInv.items['wheat'].totalQuantity).toBe(100);
  });

  it('5. Surfaces explicit recoverable error when reference is missing and recovery is impossible', async () => {
    await persistenceService.bootstrap();

    const order = supplyService.supplyChainEngine.createOrder(
      buyerId,
      sellerId,
      'wheat',
      100,
      'kg',
      'ORDER-MISSING-REF',
      false,
      'TX-MISSING-REF'
    );
    const shipmentId = order.shipmentId!;
    await persistenceService.persistTickBoundary();

    // Corrupt destination AND origin workplaces from world repository to simulate missing entity state
    worldService.engine.workplaceRepository.delete(buyerId);
    worldService.engine.workplaceRepository.delete(sellerId);

    // When arrival executes, destination is missing, attempts recovery, but seller is also missing
    await expect(
      supplyService.supplyChainEngine.handleShipmentArrival({
        shipmentId,
        orderId: 'ORDER-MISSING-REF'
      })
    ).rejects.toThrow(/Inconsistent supply chain state/);
  });

  it('6. Business procurement idempotency survives cold restart without duplicating orders', async () => {
    await persistenceService.bootstrap();

    // Configure buyer for procurement
    const buyerWp = worldService.engine.workplaceRepository.findById(buyerId)!;
    buyerWp.inventoryConfiguration = {
      'wheat': { reorderPoint: 50, targetStock: 200 }
    };
    worldService.engine.workplaceRepository.update(buyerWp);

    // Run first procurement cycle: creates order and dispatches shipment
    supplyService.businessProcurementEngine.runProcurementCycle();

    const initialOrders = supplyService.supplyChainEngine.getOrdersForBusiness(buyerId);
    expect(initialOrders.length).toBe(1);
    const orderId = initialOrders[0].orderId;

    await persistenceService.persistTickBoundary();

    // -------------------------------------------------------------
    // COLD RESTART
    // -------------------------------------------------------------
    worldService.engine.reset();
    marketService.reset();
    timeService.engine.reset();
    supplyService.reset();
    eventService.scheduler.clearEvents();

    await persistenceService.bootstrap();

    // Run procurement cycle again during same day/cycle
    supplyService.businessProcurementEngine.runProcurementCycle();

    // Should reconcile existing order without creating duplicate orders or duplicate shipments
    const ordersAfter = supplyService.supplyChainEngine.getOrdersForBusiness(buyerId);
    expect(ordersAfter.length).toBe(1);
    expect(ordersAfter[0].orderId).toBe(orderId);
  });
});
