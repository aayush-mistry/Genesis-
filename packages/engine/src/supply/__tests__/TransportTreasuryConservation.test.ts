import { WorldEngine } from '../../world/WorldEngine';
import { TimeEngine } from '../../time/TimeEngine';
import { EventScheduler } from '../../events/EventScheduler';
import { InventoryManager } from '../../inventory/InventoryManager';
import { SupplyChainEngine } from '../SupplyChainEngine';
import { BusinessProcurementEngine } from '../BusinessProcurementEngine';
import { MarketEngine, SYSTEM_TRANSPORT_ID, TRANSPORT_TREASURY_WALLET_ID } from '../../market/MarketEngine';
import { SpatialQueryService } from '../../spatial/SpatialQueryService';
import { GridSpatialIndex } from '../../spatial/GridSpatialIndex';
import { WorkplaceType, OrderStatus, ShipmentStatus, TransactionType } from '@genesis/shared';

describe('T8.6.6.3 — Transport Treasury & Money Conservation Unit Tests', () => {
  let worldEngine: WorldEngine;
  let timeEngine: TimeEngine;
  let eventScheduler: EventScheduler;
  let inventoryManager: InventoryManager;
  let spatialQueryService: SpatialQueryService;
  let supplyChainEngine: SupplyChainEngine;
  let marketEngine: MarketEngine;
  let procurementEngine: BusinessProcurementEngine;

  beforeEach(() => {
    worldEngine = new WorldEngine();
    timeEngine = new TimeEngine();
    eventScheduler = new EventScheduler(timeEngine);
    inventoryManager = new InventoryManager();

    const spatialIndex = new GridSpatialIndex(100);
    spatialQueryService = new SpatialQueryService(spatialIndex, worldEngine);
    marketEngine = new MarketEngine(worldEngine, timeEngine, eventScheduler);
    supplyChainEngine = new SupplyChainEngine(
      worldEngine,
      eventScheduler,
      timeEngine,
      inventoryManager,
      spatialQueryService,
      undefined,
      marketEngine
    );
    procurementEngine = new BusinessProcurementEngine(
      worldEngine,
      inventoryManager,
      supplyChainEngine,
      spatialQueryService,
      eventScheduler,
      timeEngine,
      marketEngine
    );
  });

  describe('1. Transport Treasury Registration & Stable Identity', () => {
    test('Treasury wallet is registered on MarketEngine instantiation with stable ID and 0 balance', () => {
      const treasuryWallet = marketEngine.getTransportTreasuryWallet();
      expect(treasuryWallet).toBeDefined();
      expect(treasuryWallet.id).toBe(TRANSPORT_TREASURY_WALLET_ID);
      expect(treasuryWallet.ownerId).toBe(SYSTEM_TRANSPORT_ID);
      expect(treasuryWallet.balance).toBe(0);
      expect(treasuryWallet.currency).toBe('GEN');
      expect(treasuryWallet.totalIncome).toBe(0);
      expect(treasuryWallet.totalExpenses).toBe(0);
    });

    test('getWallet() retrieves the treasury wallet by ownerId and by walletId', () => {
      const byOwner = marketEngine.getWallet(SYSTEM_TRANSPORT_ID);
      const byId = marketEngine.getWallet(TRANSPORT_TREASURY_WALLET_ID);
      const direct = marketEngine.getTransportTreasuryWallet();

      expect(byOwner).toBe(direct);
      expect(byId).toBe(direct);
    });

    test('Treasury wallet survives MarketEngine.clear() and reset() with 0 balance', () => {
      marketEngine.getTransportTreasuryWallet().balance = 250;
      expect(marketEngine.getWallet(SYSTEM_TRANSPORT_ID)!.balance).toBe(250);

      marketEngine.clear();
      const freshTreasury = marketEngine.getWallet(SYSTEM_TRANSPORT_ID);
      expect(freshTreasury).toBeDefined();
      expect(freshTreasury!.id).toBe(TRANSPORT_TREASURY_WALLET_ID);
      expect(freshTreasury!.ownerId).toBe(SYSTEM_TRANSPORT_ID);
      expect(freshTreasury!.balance).toBe(0);
    });

    test('registerWallet() allows hydrating existing treasury wallet without overwriting with 0', () => {
      const persistedWallet = {
        id: TRANSPORT_TREASURY_WALLET_ID,
        ownerId: SYSTEM_TRANSPORT_ID,
        balance: 750,
        currency: 'GEN',
        totalIncome: 1200,
        totalExpenses: 450
      };

      marketEngine.registerWallet(persistedWallet);
      const retrieved = marketEngine.getWallet(SYSTEM_TRANSPORT_ID);
      expect(retrieved).toBeDefined();
      expect(retrieved!.balance).toBe(750);
      expect(retrieved!.totalIncome).toBe(1200);
      expect(retrieved!.totalExpenses).toBe(450);
    });
  });

  describe('2. Transport Payment & Money Conservation', () => {
    test('A transport payment debits the buyer and credits the treasury by equal amounts, strictly conserving money', () => {
      const buyerId = 'shop-treasury-test';
      const sellerId = 'wholesale-treasury-test';
      const buyerInvId = `inv-${buyerId}`;
      const sellerInvId = `inv-${sellerId}`;

      inventoryManager.createInventory(buyerInvId, buyerId, 2000);
      inventoryManager.createInventory(sellerInvId, sellerId, 2000);
      inventoryManager.addItemQuantity(sellerInvId, 'wheat', 500, 'kg');

      const initialBuyerBalance = 50000;
      const initialSellerBalance = 1000;
      const buyerWallet = {
        id: `wallet-${buyerId}`,
        ownerId: buyerId,
        balance: initialBuyerBalance,
        currency: 'GEN',
        totalIncome: 0,
        totalExpenses: 0
      };
      const sellerWallet = {
        id: `wallet-${sellerId}`,
        ownerId: sellerId,
        balance: initialSellerBalance,
        currency: 'GEN',
        totalIncome: 0,
        totalExpenses: 0
      };

      worldEngine.workplaceRepository.create({
        id: buyerId,
        type: WorkplaceType.SHOP,
        regionId: 'reg-default',
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

      worldEngine.workplaceRepository.create({
        id: sellerId,
        type: WorkplaceType.WHOLESALE,
        regionId: 'reg-default',
        locationId: `loc-${sellerId}`,
        capacity: 10,
        occupiedPositions: 0,
        vacancies: 10,
        positions: [],
        inventoryId: sellerInvId,
        storageCapacity: 2000,
        wallet: sellerWallet
      });

      // Fixed distance = 10 -> Transport cost = 200 kg * 10 distance * 0.1 = 200 GEN
      jest.spyOn(spatialQueryService, 'calculateRoute').mockReturnValue({ distance: 10 } as any);

      const treasuryWallet = marketEngine.getTransportTreasuryWallet();
      const initialTreasuryBalance = treasuryWallet.balance; // 0
      const totalMoneyBefore = buyerWallet.balance + sellerWallet.balance + initialTreasuryBalance;

      // Execute procurement cycle
      procurementEngine.runProcurementCycle();

      const orders = supplyChainEngine.getOrdersForBusiness(buyerId);
      expect(orders.length).toBe(1);
      const order = orders[0];
      expect(order.quantity).toBe(200);

      // Verify purchase transaction
      const purchaseTxId = order.transactionId!;
      const purchaseTx = marketEngine.getTransaction(purchaseTxId);
      expect(purchaseTx).toBeDefined();
      expect(purchaseTx!.totalPrice).toBeGreaterThan(0);
      const purchasePrice = purchaseTx!.totalPrice;

      // Verify transport transaction exists and is paid to SYSTEM_TRANSPORT
      const transportTxId = purchaseTxId.replace('B2B-PROC', 'TRANS');
      const transportTx = marketEngine.getTransaction(transportTxId);
      expect(transportTx).toBeDefined();
      expect(transportTx!.buyerId).toBe(buyerId);
      expect(transportTx!.sellerId).toBe(SYSTEM_TRANSPORT_ID);
      expect(transportTx!.totalPrice).toBe(200); // 200 * 10 * 0.1

      // Verify wallet balances:
      // Buyer paid both purchase price and transport fee
      expect(buyerWallet.balance).toBe(initialBuyerBalance - purchasePrice - 200);
      expect(buyerWallet.totalExpenses).toBe(purchasePrice + 200);

      // Seller received only purchase price
      expect(sellerWallet.balance).toBe(initialSellerBalance + purchasePrice);
      expect(sellerWallet.totalIncome).toBe(purchasePrice);

      // Treasury received transport fee
      expect(treasuryWallet.balance).toBe(200);
      expect(treasuryWallet.totalIncome).toBe(200);

      // INVARIANT: Total Money is strictly conserved!
      const totalMoneyAfter = buyerWallet.balance + sellerWallet.balance + treasuryWallet.balance;
      expect(totalMoneyAfter).toBe(totalMoneyBefore);
    });

    test('If transport payment fails due to buyer insolvency, purchase transaction is rolled back and reservation is released', () => {
      const buyerId = 'shop-low-funds';
      const sellerId = 'wholesale-low-funds';
      const buyerInvId = `inv-${buyerId}`;
      const sellerInvId = `inv-${sellerId}`;

      inventoryManager.createInventory(buyerInvId, buyerId, 2000);
      inventoryManager.createInventory(sellerInvId, sellerId, 2000);
      inventoryManager.addItemQuantity(sellerInvId, 'wheat', 500, 'kg');

      // Bulk price for 200 kg is 9/kg = 1800. Transport cost for distance 10 is 200. Total landed = 2000.
      // Buyer wallet only has 1900 -> enough for goods (1800) but not enough for landed cost (2000)!
      const buyerWallet = {
        id: `wallet-${buyerId}`,
        ownerId: buyerId,
        balance: 1900,
        currency: 'GEN',
        totalIncome: 0,
        totalExpenses: 0
      };
      const sellerWallet = {
        id: `wallet-${sellerId}`,
        ownerId: sellerId,
        balance: 1000,
        currency: 'GEN',
        totalIncome: 0,
        totalExpenses: 0
      };

      worldEngine.workplaceRepository.create({
        id: buyerId,
        type: WorkplaceType.SHOP,
        regionId: 'reg-default',
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

      worldEngine.workplaceRepository.create({
        id: sellerId,
        type: WorkplaceType.WHOLESALE,
        regionId: 'reg-default',
        locationId: `loc-${sellerId}`,
        capacity: 10,
        occupiedPositions: 0,
        vacancies: 10,
        positions: [],
        inventoryId: sellerInvId,
        storageCapacity: 2000,
        wallet: sellerWallet
      });

      jest.spyOn(spatialQueryService, 'calculateRoute').mockReturnValue({ distance: 10 } as any);

      const treasuryWallet = marketEngine.getTransportTreasuryWallet();

      procurementEngine.runProcurementCycle();

      // No order created
      const orders = supplyChainEngine.getOrdersForBusiness(buyerId);
      expect(orders.length).toBe(0);

      // Balances must remain completely untouched
      expect(buyerWallet.balance).toBe(1900);
      expect(sellerWallet.balance).toBe(1000);
      expect(treasuryWallet.balance).toBe(0);

      // Seller reserved items released
      const sellerInv = inventoryManager.getInventory(sellerInvId)!;
      expect(sellerInv.items['wheat'].reservedQuantity).toBe(0);
      expect(sellerInv.items['wheat'].availableQuantity).toBe(500);
    });
  });

  describe('3. Balanced and Idempotent Transport Reversals', () => {
    test('Order timeout cancellation reverses both goods and transport payments, restoring exact balances', () => {
      const buyerId = 'shop-timeout-rev';
      const sellerId = 'wholesale-timeout-rev';
      const buyerInvId = `inv-${buyerId}`;
      const sellerInvId = `inv-${sellerId}`;

      inventoryManager.createInventory(buyerInvId, buyerId, 2000);
      inventoryManager.createInventory(sellerInvId, sellerId, 2000);
      inventoryManager.addItemQuantity(sellerInvId, 'wheat', 500, 'kg');

      const initialBuyerBal = 20000;
      const initialSellerBal = 5000;
      const buyerWallet = {
        id: `wallet-${buyerId}`,
        ownerId: buyerId,
        balance: initialBuyerBal,
        currency: 'GEN',
        totalIncome: 0,
        totalExpenses: 0
      };
      const sellerWallet = {
        id: `wallet-${sellerId}`,
        ownerId: sellerId,
        balance: initialSellerBal,
        currency: 'GEN',
        totalIncome: 0,
        totalExpenses: 0
      };

      worldEngine.workplaceRepository.create({
        id: buyerId,
        type: WorkplaceType.SHOP,
        regionId: 'reg-default',
        locationId: `loc-${buyerId}`,
        capacity: 10,
        occupiedPositions: 0,
        vacancies: 10,
        positions: [],
        inventoryId: buyerInvId,
        storageCapacity: 2000,
        wallet: buyerWallet,
        inventoryConfiguration: {
          wheat: { reorderPoint: 50, targetStock: 100 }
        }
      });

      worldEngine.workplaceRepository.create({
        id: sellerId,
        type: WorkplaceType.WHOLESALE,
        regionId: 'reg-default',
        locationId: `loc-${sellerId}`,
        capacity: 10,
        occupiedPositions: 0,
        vacancies: 10,
        positions: [],
        inventoryId: sellerInvId,
        storageCapacity: 2000,
        wallet: sellerWallet
      });

      jest.spyOn(spatialQueryService, 'calculateRoute').mockReturnValue({ distance: 15 } as any);
      const treasuryWallet = marketEngine.getTransportTreasuryWallet();

      // Run procurement to create and pay for order
      procurementEngine.runProcurementCycle();

      const orders = supplyChainEngine.getOrdersForBusiness(buyerId);
      expect(orders.length).toBe(1);
      const order = orders[0];
      const purchaseTxId = order.transactionId!;
      const transportTxId = purchaseTxId.replace('B2B-PROC', 'TRANS');
      const purchasePrice = marketEngine.getTransaction(purchaseTxId)!.totalPrice;
      const transportCost = marketEngine.getTransaction(transportTxId)!.totalPrice;

      expect(treasuryWallet.balance).toBe(transportCost);
      expect(buyerWallet.balance).toBe(initialBuyerBal - purchasePrice - transportCost);
      expect(sellerWallet.balance).toBe(initialSellerBal + purchasePrice);

      // Simulate stalled PENDING order eligible for timeout (no active shipment in-transit)
      order.status = OrderStatus.PENDING;
      order.shipmentId = undefined;
      order.createdAt = 0;
      timeEngine.setCurrentTime({ year: 1, month: 1, day: 2, hour: 0, minute: 0, second: 0 }); // > 1000s

      supplyChainEngine.setOrderTimeoutSeconds(100);
      const recovered = supplyChainEngine.recoverStalledOrders();
      expect(recovered.length).toBe(1);
      expect(order.status).toBe(OrderStatus.CANCELLED);

      // Verify refund:
      // Buyer credited purchase + transport
      expect(buyerWallet.balance).toBe(initialBuyerBal);
      // Seller debited purchase
      expect(sellerWallet.balance).toBe(initialSellerBal);
      // Treasury debited transport
      expect(treasuryWallet.balance).toBe(0);

      // Total money conservation
      expect(buyerWallet.balance + sellerWallet.balance + treasuryWallet.balance).toBe(initialBuyerBal + initialSellerBal);

      // Replaying recovery must be idempotent: does not change balances twice
      supplyChainEngine.recoverStalledOrders();
      expect(buyerWallet.balance).toBe(initialBuyerBal);
      expect(sellerWallet.balance).toBe(initialSellerBal);
      expect(treasuryWallet.balance).toBe(0);
    });

    test('Shipment arrival failure reverses both goods and transport payments, restoring exact balances', async () => {
      const buyerId = 'shop-arrival-fail';
      const sellerId = 'wholesale-arrival-fail';
      const buyerInvId = `inv-${buyerId}`;
      const sellerInvId = `inv-${sellerId}`;

      // Buyer inventory has 0 capacity so delivery will fail
      inventoryManager.createInventory(buyerInvId, buyerId, 0);
      inventoryManager.createInventory(sellerInvId, sellerId, 2000);
      inventoryManager.addItemQuantity(sellerInvId, 'wheat', 500, 'kg');

      const initialBuyerBal = 25000;
      const initialSellerBal = 8000;
      const buyerWallet = {
        id: `wallet-${buyerId}`,
        ownerId: buyerId,
        balance: initialBuyerBal,
        currency: 'GEN',
        totalIncome: 0,
        totalExpenses: 0
      };
      const sellerWallet = {
        id: `wallet-${sellerId}`,
        ownerId: sellerId,
        balance: initialSellerBal,
        currency: 'GEN',
        totalIncome: 0,
        totalExpenses: 0
      };

      worldEngine.workplaceRepository.create({
        id: buyerId,
        type: WorkplaceType.SHOP,
        regionId: 'reg-default',
        locationId: `loc-${buyerId}`,
        capacity: 10,
        occupiedPositions: 0,
        vacancies: 10,
        positions: [],
        inventoryId: buyerInvId,
        storageCapacity: 0,
        wallet: buyerWallet,
        inventoryConfiguration: {
          wheat: { reorderPoint: 50, targetStock: 100 }
        }
      });

      worldEngine.workplaceRepository.create({
        id: sellerId,
        type: WorkplaceType.WHOLESALE,
        regionId: 'reg-default',
        locationId: `loc-${sellerId}`,
        capacity: 10,
        occupiedPositions: 0,
        vacancies: 10,
        positions: [],
        inventoryId: sellerInvId,
        storageCapacity: 2000,
        wallet: sellerWallet
      });

      jest.spyOn(spatialQueryService, 'calculateRoute').mockReturnValue({ distance: 20 } as any);
      const treasuryWallet = marketEngine.getTransportTreasuryWallet();

      // Process transaction manually to simulate dispatched order with shipment
      const txId = 'B2B-PROC-shop-arrival-fail-wholesale-arrival-fail-wheat-c1';
      const transportTxId = 'TRANS-shop-arrival-fail-wholesale-arrival-fail-wheat-c1';
      marketEngine.processTransaction(buyerId, sellerId, 'wheat', 100, 'kg', 10, 1000, 'GEN', TransactionType.WHOLESALE_PURCHASE, 'reg-default', txId);
      marketEngine.processTransaction(buyerId, SYSTEM_TRANSPORT_ID, null, null, null, null, 200, 'GEN', TransactionType.TRANSPORT_EXPENSE, 'reg-default', transportTxId);

      expect(treasuryWallet.balance).toBe(200);
      expect(buyerWallet.balance).toBe(initialBuyerBal - 1200);
      expect(sellerWallet.balance).toBe(initialSellerBal + 1000);

      const order = supplyChainEngine.createOrder(buyerId, sellerId, 'wheat', 100, 'kg', 'order-arrival-fail', false, txId, 10, 1000, 'GEN');
      expect(order.status).toBe(OrderStatus.DISPATCHED);
      const shipmentId = order.shipmentId!;

      // Arrival triggers and fails because buyer inventory has 0 capacity
      await supplyChainEngine.handleShipmentArrival({ shipmentId, orderId: order.orderId });

      expect(order.status).toBe(OrderStatus.FAILED);
      const shipment = supplyChainEngine.getShipment(shipmentId)!;
      expect(shipment.status).toBe(ShipmentStatus.FAILED);

      // Verify refund:
      expect(buyerWallet.balance).toBe(initialBuyerBal);
      expect(sellerWallet.balance).toBe(initialSellerBal);
      expect(treasuryWallet.balance).toBe(0);

      // INVARIANT: Conservation
      expect(buyerWallet.balance + sellerWallet.balance + treasuryWallet.balance).toBe(initialBuyerBal + initialSellerBal);

      // Late re-trigger of arrival must safely ignore without duplicate refunds
      await supplyChainEngine.handleShipmentArrival({ shipmentId, orderId: order.orderId });
      expect(buyerWallet.balance).toBe(initialBuyerBal);
      expect(sellerWallet.balance).toBe(initialSellerBal);
      expect(treasuryWallet.balance).toBe(0);
    });

    test('Insufficient treasury funds policy: rejects reversal without silently minting money', () => {
      const buyerId = 'shop-insufficient-treasury';

      const buyerWallet = {
        id: `wallet-${buyerId}`,
        ownerId: buyerId,
        balance: 5000,
        currency: 'GEN',
        totalIncome: 0,
        totalExpenses: 0
      };
      marketEngine.registerWallet(buyerWallet);

      const treasuryWallet = marketEngine.getTransportTreasuryWallet();

      // Process transport transaction of 300 GEN
      const transportTxId = 'TRANS-test-insufficient-1';
      marketEngine.processTransaction(
        buyerId,
        SYSTEM_TRANSPORT_ID,
        null, null, null, null,
        300,
        'GEN',
        TransactionType.TRANSPORT_EXPENSE,
        'reg-default',
        transportTxId
      );

      expect(buyerWallet.balance).toBe(4700);
      expect(treasuryWallet.balance).toBe(300);

      // Suppose treasury funds were depleted/spent down to 100 (< 300 required)
      treasuryWallet.balance = 100;

      // Attempt reversal
      const revTxId = `${transportTxId}-REV`;
      const result = marketEngine.reverseTransaction(transportTxId, revTxId, 'Test insufficient funds rejection');

      // Must be REJECTED
      expect(result).toBeNull();

      // Balances must NOT be silently altered or created out of thin air!
      expect(buyerWallet.balance).toBe(4700);
      expect(treasuryWallet.balance).toBe(100);

      // Transaction is NOT marked as reversed, so it can be retried once solvent
      expect(marketEngine.isTransactionReversed(transportTxId)).toBe(false);

      // When funds are restored to treasury (>= 300):
      treasuryWallet.balance = 500;
      const retryResult = marketEngine.reverseTransaction(transportTxId, revTxId, 'Retry after solvency');
      expect(retryResult).not.toBeNull();
      expect(buyerWallet.balance).toBe(5000);
      expect(treasuryWallet.balance).toBe(200); // 500 - 300
      expect(marketEngine.isTransactionReversed(transportTxId)).toBe(true);
    });
  });
});
