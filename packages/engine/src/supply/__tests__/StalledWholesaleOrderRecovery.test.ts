import { SupplyChainEngine } from '../SupplyChainEngine';
import { InventoryManager } from '../../inventory/InventoryManager';
import { WorldEngine } from '../../world/WorldEngine';
import { EventScheduler } from '../../events/EventScheduler';
import { TimeEngine } from '../../time/TimeEngine';
import { SpatialQueryService } from '../../spatial/SpatialQueryService';
import { MarketEngine } from '../../market/MarketEngine';
import { OrderStatus, ShipmentStatus, WorkplaceType } from '@genesis/shared';

describe('Task 2 — Stalled Wholesale Order Recovery', () => {
  let supplyChainEngine: SupplyChainEngine;
  let inventoryManager: InventoryManager;
  let worldEngine: WorldEngine;
  let timeEngine: TimeEngine;
  let eventScheduler: EventScheduler;
  let spatialQueryService: SpatialQueryService;
  let marketEngine: MarketEngine;

  const buyerId = 'workplace-shop-1';
  const wholesaleId = 'workplace-wholesale-1';
  const buyerInvId = 'inv-shop-1';
  const wholesaleInvId = 'inv-wholesale-1';

  beforeEach(() => {
    inventoryManager = new InventoryManager();
    worldEngine = new WorldEngine();
    timeEngine = new TimeEngine();
    eventScheduler = new EventScheduler(timeEngine);
    spatialQueryService = new SpatialQueryService({} as any, worldEngine);
    marketEngine = new MarketEngine(worldEngine, timeEngine, eventScheduler);

    // Mock calculateRoute to avoid needing spatial grid setup
    jest.spyOn(spatialQueryService, 'calculateRoute').mockReturnValue({ path: [], distance: 10 });

    // Setup workplaces with wallets and inventories
    worldEngine.workplaceRepository.create({
      id: buyerId,
      type: WorkplaceType.SHOP,
      locationId: 'loc-buyer',
      regionId: 'reg-1',
      capacity: 10,
      occupiedPositions: 0,
      vacancies: 10,
      positions: [],
      inventoryId: buyerInvId,
      wallet: {
        id: 'wallet-buyer',
        ownerId: buyerId,
        balance: 5000,
        currency: 'GEN',
        totalIncome: 0,
        totalExpenses: 0
      }
    });

    worldEngine.workplaceRepository.create({
      id: wholesaleId,
      type: WorkplaceType.WHOLESALE,
      locationId: 'loc-wholesale',
      regionId: 'reg-1',
      capacity: 50,
      occupiedPositions: 0,
      vacancies: 50,
      positions: [],
      inventoryId: wholesaleInvId,
      wallet: {
        id: 'wallet-wholesale',
        ownerId: wholesaleId,
        balance: 10000,
        currency: 'GEN',
        totalIncome: 0,
        totalExpenses: 0
      }
    });

    inventoryManager.createInventory(buyerInvId, buyerId, 2000);
    inventoryManager.createInventory(wholesaleInvId, wholesaleId, 5000);

    supplyChainEngine = new SupplyChainEngine(
      worldEngine,
      eventScheduler,
      timeEngine,
      inventoryManager,
      spatialQueryService
    );
    supplyChainEngine.setMarketEngine(marketEngine);
  });

  test('1. Eligibility check: only PENDING orders without active shipments or reversals are eligible', () => {
    supplyChainEngine.setOrderTimeoutSeconds(100);

    // 1. Pending order with wholesale (no stock in wholesale, so it stays PENDING)
    const pendingOrder = supplyChainEngine.createOrder(buyerId, wholesaleId, 'wheat', 50, 'kg', 'order-pending-1');
    expect(pendingOrder.status).toBe(OrderStatus.PENDING);

    // 2. Dispatched order (with stock)
    inventoryManager.addItemQuantity(wholesaleInvId, 'timber', 100, 'kg');
    const dispatchedOrder = supplyChainEngine.createOrder(buyerId, wholesaleId, 'timber', 30, 'kg', 'order-dispatched-1');
    expect(dispatchedOrder.status).toBe(OrderStatus.DISPATCHED);

    // Check at time = 500 (order age = 500 > 100)
    expect(supplyChainEngine.isOrderEligibleForTimeout(pendingOrder, 500)).toBe(true);
    expect(supplyChainEngine.isOrderEligibleForTimeout(dispatchedOrder, 500)).toBe(false);

    // Cancelled / failed order is not eligible
    pendingOrder.status = OrderStatus.CANCELLED;
    expect(supplyChainEngine.isOrderEligibleForTimeout(pendingOrder, 500)).toBe(false);
  });

  test('2. Boundary timing: strictly respects simulation time timeout window', () => {
    supplyChainEngine.setOrderTimeoutSeconds(1000); // 1000 simulation seconds

    // Created at simulation time = 500
    timeEngine.advance(500);
    const order = supplyChainEngine.createOrder(buyerId, wholesaleId, 'wheat', 50, 'kg', 'order-boundary-1');
    expect(order.createdAt).toBe(500);

    // At 1499s (age = 999s < 1000s) -> not eligible
    expect(supplyChainEngine.isOrderEligibleForTimeout(order, 1499)).toBe(false);

    // At exactly 1500s (age = 1000s === 1000s) -> eligible
    expect(supplyChainEngine.isOrderEligibleForTimeout(order, 1500)).toBe(true);

    // At 1501s (age = 1001s > 1000s) -> eligible
    expect(supplyChainEngine.isOrderEligibleForTimeout(order, 1501)).toBe(true);
  });

  test('3. Reservation release: releases reserved seller inventory on timeout without creating/destroying stock', () => {
    supplyChainEngine.setOrderTimeoutSeconds(200);

    // Seller has 40 units in stock
    inventoryManager.addItemQuantity(wholesaleInvId, 'wheat', 40, 'kg');
    // Manually reserve 40 units for an order
    inventoryManager.reserveItemQuantity(wholesaleInvId, 'wheat', 40);

    const invBefore = inventoryManager.getInventory(wholesaleInvId)!;
    expect(invBefore.items['wheat'].totalQuantity).toBe(40);
    expect(invBefore.items['wheat'].reservedQuantity).toBe(40);
    expect(invBefore.items['wheat'].availableQuantity).toBe(0);

    // Order created but pending
    const order = supplyChainEngine.createOrder(buyerId, wholesaleId, 'wheat', 40, 'kg', 'order-res-1');
    order.status = OrderStatus.PENDING;

    // Timeout recovery at t = 300
    const timedOut = supplyChainEngine.recoverStalledOrders(300);
    expect(timedOut.length).toBe(1);
    expect(order.status).toBe(OrderStatus.CANCELLED);

    // Reserved quantity must be released back to available, total remains strictly 40
    const invAfter = inventoryManager.getInventory(wholesaleInvId)!;
    expect(invAfter.items['wheat'].totalQuantity).toBe(40);
    expect(invAfter.items['wheat'].reservedQuantity).toBe(0);
    expect(invAfter.items['wheat'].availableQuantity).toBe(40);
  });

  test('4. Payment and refund idempotency: reverses payment once and prevents double refunds', () => {
    supplyChainEngine.setOrderTimeoutSeconds(100);

    const txId = 'B2B-PROC-test-tx-1';
    // Buyer pays wholesale 1000 GEN
    marketEngine.processTransaction(
      buyerId, wholesaleId, 'wheat', 50, 'kg', 20, 1000, 'GEN',
      'RETAIL_PROCUREMENT' as any, 'reg-1', txId
    );

    const buyerWallet = worldEngine.workplaceRepository.findById(buyerId)!.wallet!;
    const wholesaleWallet = worldEngine.workplaceRepository.findById(wholesaleId)!.wallet!;
    expect(buyerWallet.balance).toBe(4000); // 5000 - 1000
    expect(wholesaleWallet.balance).toBe(11000); // 10000 + 1000

    const order = supplyChainEngine.createOrder(
      buyerId, wholesaleId, 'wheat', 50, 'kg', 'order-refund-1', false, txId, 20, 1000, 'GEN'
    );
    expect(order.status).toBe(OrderStatus.PENDING);

    // Timeout at t = 200
    supplyChainEngine.recoverStalledOrders(200);
    expect(order.status).toBe(OrderStatus.CANCELLED);

    // Refunded exactly once
    expect(buyerWallet.balance).toBe(5000);
    expect(wholesaleWallet.balance).toBe(10000);
    expect(marketEngine.isTransactionReversed(txId)).toBe(true);

    // Re-running recovery routine should NOT re-refund
    supplyChainEngine.recoverStalledOrders(300);
    expect(buyerWallet.balance).toBe(5000);
    expect(wholesaleWallet.balance).toBe(10000);
  });

  test('5. Procurement unblocking: timed-out order no longer counts towards pending incoming quantity', () => {
    supplyChainEngine.setOrderTimeoutSeconds(100);

    const order = supplyChainEngine.createOrder(buyerId, wholesaleId, 'wheat', 100, 'kg', 'order-pending-block');
    expect(order.status).toBe(OrderStatus.PENDING);

    // While pending, pending incoming quantity is 100
    expect(supplyChainEngine.getPendingIncomingQuantity(buyerId, 'wheat')).toBe(100);

    // After timeout, order is cancelled
    supplyChainEngine.recoverStalledOrders(200);
    expect(order.status).toBe(OrderStatus.CANCELLED);

    // Pending incoming quantity must drop to 0, allowing re-procurement!
    expect(supplyChainEngine.getPendingIncomingQuantity(buyerId, 'wheat')).toBe(0);
  });

  test('6. Late arrival safety: shipment arrival for cancelled order returns goods to seller without duplicating refund', async () => {
    // Wholesale dispatches shipment
    inventoryManager.addItemQuantity(wholesaleInvId, 'wheat', 50, 'kg');
    const txId = 'B2B-PROC-late-tx-1';
    marketEngine.processTransaction(buyerId, wholesaleId, 'wheat', 50, 'kg', 10, 500, 'GEN', 'RETAIL_PROCUREMENT' as any, 'reg-1', txId);

    const order = supplyChainEngine.createOrder(buyerId, wholesaleId, 'wheat', 50, 'kg', 'order-late-1', false, txId, 10, 500, 'GEN');
    expect(order.status).toBe(OrderStatus.DISPATCHED);
    const shipmentId = order.shipmentId!;
    const shipment = supplyChainEngine.getShipment(shipmentId)!;
    expect(shipment.status).toBe(ShipmentStatus.IN_TRANSIT);

    // Suppose the order was manually cancelled or timed out
    order.status = OrderStatus.CANCELLED;
    marketEngine.reverseTransaction(txId, `${txId}-REV-TIMEOUT`, 'Simulated timeout cancellation');

    const buyerWallet = worldEngine.workplaceRepository.findById(buyerId)!.wallet!;
    const wholesaleWallet = worldEngine.workplaceRepository.findById(wholesaleId)!.wallet!;
    expect(buyerWallet.balance).toBe(5000); // Refunded
    expect(wholesaleWallet.balance).toBe(10000);

    // Now late shipment arrival event triggers!
    await supplyChainEngine.handleShipmentArrival({ shipmentId, orderId: order.orderId });

    // Shipment must be cancelled
    expect(shipment.status).toBe(ShipmentStatus.CANCELLED);
    // Order remains cancelled, NOT revived to DELIVERED
    expect(order.status).toBe(OrderStatus.CANCELLED);

    // Goods returned to seller (wholesale), NOT given to buyer
    const buyerInv = inventoryManager.getInventory(buyerInvId)!;
    expect(buyerInv.items['wheat']).toBeUndefined();
    const wholesaleInv = inventoryManager.getInventory(wholesaleInvId)!;
    expect(wholesaleInv.items['wheat'].totalQuantity).toBe(50);

    // Buyer wallet must NOT receive duplicate refund
    expect(buyerWallet.balance).toBe(5000);
    expect(wholesaleWallet.balance).toBe(10000);
  });

  test('7. Late retry for seller does not process cancelled order', () => {
    const order = supplyChainEngine.createOrder(buyerId, wholesaleId, 'wheat', 50, 'kg', 'order-no-revive');
    order.status = OrderStatus.CANCELLED;

    // Wholesale now receives stock
    inventoryManager.addItemQuantity(wholesaleInvId, 'wheat', 100, 'kg');

    // Trigger retry
    (supplyChainEngine as any).retryPendingOrdersForSeller(wholesaleId);

    // Cancelled order must NOT be revived or dispatched
    expect(order.status).toBe(OrderStatus.CANCELLED);
    expect(order.shipmentId).toBeUndefined();
  });
});
