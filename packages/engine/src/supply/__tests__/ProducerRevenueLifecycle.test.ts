import { WorldEngine } from '../../world/WorldEngine';
import { InventoryManager } from '../../inventory/InventoryManager';
import { SupplyChainEngine } from '../SupplyChainEngine';
import { BusinessProcurementEngine } from '../BusinessProcurementEngine';
import { CommerceAutomation } from '../CommerceAutomation';
import { MarketEngine } from '../../market/MarketEngine';
import { FinancialEngine } from '../../finance/FinancialEngine';
import { EventScheduler } from '../../events/EventScheduler';
import { TimeEngine } from '../../time/TimeEngine';
import { SpatialQueryService } from '../../spatial/SpatialQueryService';
import { GridSpatialIndex } from '../../spatial/GridSpatialIndex';
import { PriceFormationService } from '../../market/PriceFormationService';
import { WorkplaceType, OrderStatus, ShipmentStatus } from '@genesis/shared';

describe('Producer Revenue & Market Sustainability (T8.6.4-R1)', () => {
  let worldEngine: WorldEngine;
  let inventoryManager: InventoryManager;
  let timeEngine: TimeEngine;
  let eventScheduler: EventScheduler;
  let spatialQueryService: SpatialQueryService;
  let supplyChainEngine: SupplyChainEngine;
  let marketEngine: MarketEngine;
  let financialEngine: FinancialEngine;
  let procurementEngine: BusinessProcurementEngine;
  let commerceAutomation: CommerceAutomation;

  beforeEach(() => {
    worldEngine = new WorldEngine();
    timeEngine = new TimeEngine();
    eventScheduler = new EventScheduler(timeEngine);
    inventoryManager = new InventoryManager();
    const spatialIndex = new GridSpatialIndex(100);
    spatialQueryService = new SpatialQueryService(spatialIndex, worldEngine);
    jest.spyOn(spatialQueryService, 'calculateRoute').mockReturnValue({ path: [], distance: 10 });

    supplyChainEngine = new SupplyChainEngine(
      worldEngine,
      eventScheduler,
      timeEngine,
      inventoryManager,
      spatialQueryService
    );

    marketEngine = new MarketEngine(
      worldEngine,
      timeEngine,
      eventScheduler
    );

    financialEngine = new FinancialEngine(
      worldEngine,
      marketEngine,
      eventScheduler,
      timeEngine
    );

    supplyChainEngine.setMarketEngine(marketEngine);

    procurementEngine = new BusinessProcurementEngine(
      worldEngine,
      inventoryManager,
      supplyChainEngine,
      spatialQueryService,
      eventScheduler,
      timeEngine,
      marketEngine
    );

    commerceAutomation = new CommerceAutomation(
      worldEngine,
      supplyChainEngine,
      inventoryManager,
      spatialQueryService,
      eventScheduler,
      timeEngine
    );
  });

  test('1. ProducerRevenueEndToEnd — paid sale updates buyer wallet, producer wallet, revenue/profit, and physical inventory', () => {
    const producerId = 'producer-farm-1';
    const buyerId = 'buyer-shop-1';

    // 1. Setup Producer
    inventoryManager.createInventory(`inv-${producerId}`, producerId, 1000);
    inventoryManager.addItemQuantity(`inv-${producerId}`, 'wheat', 500, 'kg');

    const producerWp: any = {
      id: producerId,
      type: WorkplaceType.FARM,
      regionId: 'reg-1',
      locationId: 'loc-prod',
      capacity: 10,
      occupiedPositions: 2,
      vacancies: 8,
      positions: [],
      inventoryId: `inv-${producerId}`,
      storageCapacity: 1000,
      wallet: {
        id: `wallet-${producerId}`,
        ownerId: producerId,
        balance: 1000,
        currency: 'GEN',
        totalIncome: 0,
        totalExpenses: 0
      },
      revenue: 0,
      expenses: 0,
      profit: 0
    };
    worldEngine.workplaceRepository.create(producerWp);

    // 2. Setup Buyer
    inventoryManager.createInventory(`inv-${buyerId}`, buyerId, 1000);
    inventoryManager.addItemQuantity(`inv-${buyerId}`, 'wheat', 10, 'kg');

    const buyerWp: any = {
      id: buyerId,
      type: WorkplaceType.SHOP,
      regionId: 'reg-1',
      locationId: 'loc-buyer',
      capacity: 10,
      occupiedPositions: 2,
      vacancies: 8,
      positions: [],
      inventoryId: `inv-${buyerId}`,
      storageCapacity: 1000,
      wallet: {
        id: `wallet-${buyerId}`,
        ownerId: buyerId,
        balance: 5000,
        currency: 'GEN',
        totalIncome: 0,
        totalExpenses: 0
      },
      revenue: 0,
      expenses: 0,
      profit: 0,
      inventoryConfiguration: {
        'wheat': { reorderPoint: 50, targetStock: 200 }
      }
    };
    worldEngine.workplaceRepository.create(buyerWp);

    // Run procurement
    procurementEngine.runProcurementCycle();

    // Check financial balances
    const producerWallet = worldEngine.workplaceRepository.findById(producerId)!.wallet!;
    const buyerWallet = worldEngine.workplaceRepository.findById(buyerId)!.wallet!;

    expect(producerWallet.balance).toBeGreaterThan(1000);
    expect(producerWallet.totalIncome).toBeGreaterThan(0);
    expect(buyerWallet.balance).toBeLessThan(5000);
    expect(buyerWallet.totalExpenses).toBeGreaterThan(0);

    // Check financial accounting revenue & profit
    const updatedProducer = worldEngine.workplaceRepository.findById(producerId)!;
    expect(updatedProducer.revenue).toBeGreaterThan(0);
    expect(updatedProducer.profit).toBe(updatedProducer.revenue! - updatedProducer.expenses!);

    // Verify producer physical inventory decreased into transit
    const producerInv = inventoryManager.getInventory(`inv-${producerId}`)!;
    expect(producerInv.items['wheat'].totalQuantity).toBeLessThan(500);

    // Deliver shipment and verify buyer physical inventory increased
    const activeShipments = supplyChainEngine.getAllActiveShipments();
    expect(activeShipments.length).toBe(1);
    const shipment = activeShipments[0];
    const order = supplyChainEngine.getOrder(supplyChainEngine.getOrdersForBusiness(buyerId)[0].orderId)!;

    supplyChainEngine.handleShipmentArrival({
      shipmentId: shipment.shipmentId,
      orderId: order.orderId
    });

    const buyerInv = inventoryManager.getInventory(`inv-${buyerId}`)!;
    expect(buyerInv.items['wheat'].totalQuantity).toBe(200);
    expect(order.status).toBe(OrderStatus.DELIVERED);
  });

  test('2. B2BProcurementIdempotency — replaying same procurement requirement produces no duplicate transaction, order, or wallet mutations', () => {
    const producerId = 'producer-farm-idem';
    const buyerId = 'buyer-shop-idem';

    inventoryManager.createInventory(`inv-${producerId}`, producerId, 1000);
    inventoryManager.addItemQuantity(`inv-${producerId}`, 'wheat', 500, 'kg');

    const producerWp: any = {
      id: producerId,
      type: WorkplaceType.FARM,
      regionId: 'reg-1',
      locationId: 'loc-prod-2',
      capacity: 10,
      occupiedPositions: 2,
      vacancies: 8,
      positions: [],
      inventoryId: `inv-${producerId}`,
      storageCapacity: 1000,
      wallet: {
        id: `wallet-${producerId}`,
        ownerId: producerId,
        balance: 1000,
        currency: 'GEN',
        totalIncome: 0,
        totalExpenses: 0
      }
    };
    worldEngine.workplaceRepository.create(producerWp);

    // Create Buyer Inventory
    inventoryManager.createInventory(`inv-${buyerId}`, buyerId, 1000);
    inventoryManager.addItemQuantity(`inv-${buyerId}`, 'wheat', 10, 'kg');

    const buyerWp: any = {
      id: buyerId,
      type: WorkplaceType.SHOP,
      regionId: 'reg-1',
      locationId: 'loc-buyer-2',
      capacity: 10,
      occupiedPositions: 2,
      vacancies: 8,
      positions: [],
      inventoryId: `inv-${buyerId}`,
      storageCapacity: 1000,
      wallet: {
        id: `wallet-${buyerId}`,
        ownerId: buyerId,
        balance: 5000,
        currency: 'GEN',
        totalIncome: 0,
        totalExpenses: 0
      },
      inventoryConfiguration: {
        'wheat': { reorderPoint: 50, targetStock: 200 }
      }
    };
    worldEngine.workplaceRepository.create(buyerWp);

    // Run cycle once
    procurementEngine.runProcurementCycle();

    const buyerBalanceAfter1 = buyerWp.wallet.balance;
    const producerBalanceAfter1 = producerWp.wallet.balance;
    const ordersAfter1 = supplyChainEngine.getOrdersForBusiness(buyerId).length;
    const shipmentsAfter1 = supplyChainEngine.getAllActiveShipments().length;
    const txCountAfter1 = marketEngine.getTransactionsByEntity(buyerId).length;

    expect(ordersAfter1).toBe(1);
    expect(shipmentsAfter1).toBe(1);
    expect(txCountAfter1).toBeGreaterThanOrEqual(1);

    // Replay cycle in the SAME simulation cycle/day
    procurementEngine.runProcurementCycle();

    expect(buyerWp.wallet.balance).toBe(buyerBalanceAfter1);
    expect(producerWp.wallet.balance).toBe(producerBalanceAfter1);
    expect(supplyChainEngine.getOrdersForBusiness(buyerId).length).toBe(ordersAfter1);
    expect(supplyChainEngine.getAllActiveShipments().length).toBe(shipmentsAfter1);
    expect(marketEngine.getTransactionsByEntity(buyerId).length).toBe(txCountAfter1);

    // Deliver day 1 shipment so it is received
    const activeShipments = supplyChainEngine.getAllActiveShipments();
    const order1 = supplyChainEngine.getOrdersForBusiness(buyerId)[0];
    supplyChainEngine.handleShipmentArrival({
      shipmentId: activeShipments[0].shipmentId,
      orderId: order1.orderId
    });

    // Advance to next simulation day
    const nextTime = timeEngine.getCurrentTime();
    nextTime.day += 1;
    timeEngine.setCurrentTime(nextTime);

    // Simulate consumption of stock so stock is below reorder point again on the new day
    inventoryManager.getInventory(`inv-${buyerId}`)!.items['wheat'].totalQuantity = 10;

    // New day cycle should place a legitimate new order
    procurementEngine.runProcurementCycle();

    expect(supplyChainEngine.getOrdersForBusiness(buyerId).length).toBe(ordersAfter1 + 1);
    expect(buyerWp.wallet.balance).toBeLessThan(buyerBalanceAfter1);
    expect(producerWp.wallet.balance).toBeGreaterThan(producerBalanceAfter1);
  });

  test('3. AllProducersCommercialViability — fishing sites and forest sites receive legitimate demand for raw_fish and timber', () => {
    const fishingId = 'producer-fish-1';
    const forestId = 'producer-timber-1';
    const shopId = 'buyer-grocery-1';

    // 1. Setup Fishing Site
    inventoryManager.createInventory(`inv-${fishingId}`, fishingId, 1000);
    inventoryManager.addItemQuantity(`inv-${fishingId}`, 'raw_fish', 300, 'kg');
    worldEngine.workplaceRepository.create({
      id: fishingId,
      type: WorkplaceType.FISHING_SITE,
      regionId: 'reg-1',
      locationId: 'loc-fish',
      capacity: 10,
      occupiedPositions: 2,
      vacancies: 8,
      positions: [],
      inventoryId: `inv-${fishingId}`,
      storageCapacity: 1000,
      wallet: { id: `wallet-${fishingId}`, ownerId: fishingId, balance: 1000, currency: 'GEN', totalIncome: 0, totalExpenses: 0 }
    });

    // 2. Setup Forest Site
    inventoryManager.createInventory(`inv-${forestId}`, forestId, 1000);
    inventoryManager.addItemQuantity(`inv-${forestId}`, 'timber', 300, 'kg');
    worldEngine.workplaceRepository.create({
      id: forestId,
      type: WorkplaceType.FOREST_SITE,
      regionId: 'reg-1',
      locationId: 'loc-timber',
      capacity: 10,
      occupiedPositions: 2,
      vacancies: 8,
      positions: [],
      inventoryId: `inv-${forestId}`,
      storageCapacity: 1000,
      wallet: { id: `wallet-${forestId}`, ownerId: forestId, balance: 1000, currency: 'GEN', totalIncome: 0, totalExpenses: 0 }
    });

    // 3. Setup Commercial Shop with raw_fish and timber procurement configs
    inventoryManager.createInventory(`inv-${shopId}`, shopId, 1000);
    worldEngine.workplaceRepository.create({
      id: shopId,
      type: WorkplaceType.SHOP,
      regionId: 'reg-1',
      locationId: 'loc-shop',
      capacity: 10,
      occupiedPositions: 2,
      vacancies: 8,
      positions: [],
      inventoryId: `inv-${shopId}`,
      storageCapacity: 1000,
      wallet: { id: `wallet-${shopId}`, ownerId: shopId, balance: 20000, currency: 'GEN', totalIncome: 0, totalExpenses: 0 },
      inventoryConfiguration: {
        'raw_fish': { reorderPoint: 30, targetStock: 150 },
        'timber': { reorderPoint: 20, targetStock: 100 }
      }
    });

    procurementEngine.runProcurementCycle();

    const orders = supplyChainEngine.getOrdersForBusiness(shopId);
    expect(orders.some(o => o.productId === 'raw_fish' && o.sellerId === fishingId)).toBe(true);
    expect(orders.some(o => o.productId === 'timber' && o.sellerId === forestId)).toBe(true);

    const fishWallet = worldEngine.workplaceRepository.findById(fishingId)!.wallet!;
    const timberWallet = worldEngine.workplaceRepository.findById(forestId)!.wallet!;

    expect(fishWallet.balance).toBeGreaterThan(1000);
    expect(fishWallet.totalIncome).toBeGreaterThan(0);
    expect(timberWallet.balance).toBeGreaterThan(1000);
    expect(timberWallet.totalIncome).toBeGreaterThan(0);
  });

  test('4. FailedOrderCompensatingRefund — arrival failure restores goods to seller and idempotently reverses transaction', () => {
    const producerId = 'producer-refund-1';
    const buyerId = 'buyer-refund-1';

    inventoryManager.createInventory(`inv-${producerId}`, producerId, 1000);
    inventoryManager.addItemQuantity(`inv-${producerId}`, 'wheat', 200, 'kg');

    const producerWp: any = {
      id: producerId,
      type: WorkplaceType.FARM,
      regionId: 'reg-1',
      locationId: 'loc-p-ref',
      capacity: 10,
      occupiedPositions: 2,
      vacancies: 8,
      positions: [],
      inventoryId: `inv-${producerId}`,
      storageCapacity: 1000,
      wallet: { id: `wallet-${producerId}`, ownerId: producerId, balance: 1000, currency: 'GEN', totalIncome: 0, totalExpenses: 0 }
    };
    worldEngine.workplaceRepository.create(producerWp);

    // Create buyer with limited storage capacity so delivery will fail
    inventoryManager.createInventory(`inv-${buyerId}`, buyerId, 50); // Only 50 capacity!
    inventoryManager.addItemQuantity(`inv-${buyerId}`, 'wheat', 40, 'kg'); // 40 used, only 10 space left!

    const buyerWp: any = {
      id: buyerId,
      type: WorkplaceType.SHOP,
      regionId: 'reg-1',
      locationId: 'loc-b-ref',
      capacity: 10,
      occupiedPositions: 2,
      vacancies: 8,
      positions: [],
      inventoryId: `inv-${buyerId}`,
      storageCapacity: 50,
      wallet: { id: `wallet-${buyerId}`, ownerId: buyerId, balance: 5000, currency: 'GEN', totalIncome: 0, totalExpenses: 0 },
      inventoryConfiguration: {
        'wheat': { reorderPoint: 50, targetStock: 100 }
      }
    };
    worldEngine.workplaceRepository.create(buyerWp);

    // Run procurement (attempts to procure 10 units respecting space)
    procurementEngine.runProcurementCycle();

    const orders = supplyChainEngine.getOrdersForBusiness(buyerId);
    expect(orders.length).toBe(1);
    const order = orders[0];
    const shipment = supplyChainEngine.getShipment(order.shipmentId!)!;

    // Now, before arrival, buyer inventory gets filled to capacity by something else
    inventoryManager.addItemQuantity(`inv-${buyerId}`, 'iron_ore', 10, 'kg'); // Now 100% full (50/50)!

    // Trigger arrival
    supplyChainEngine.handleShipmentArrival({
      shipmentId: shipment.shipmentId,
      orderId: order.orderId
    });

    // Shipment and order must be marked FAILED
    expect(shipment.status).toBe(ShipmentStatus.FAILED);
    expect(order.status).toBe(OrderStatus.FAILED);

    // Compensating reversal must restore buyer wallet and debit seller wallet
    const buyerWalletAfter = worldEngine.workplaceRepository.findById(buyerId)!.wallet!;
    const producerWalletAfter = worldEngine.workplaceRepository.findById(producerId)!.wallet!;
    expect(buyerWalletAfter.balance).toBe(5000);
    expect(producerWalletAfter.balance).toBe(1000);

    // Goods must NOT be destroyed — safely returned to producer
    const producerInv = inventoryManager.getInventory(`inv-${producerId}`)!;
    expect(producerInv.items['wheat'].totalQuantity).toBe(200);

    // Double reversal check: applying arrival failure a second time is a no-op
    supplyChainEngine.handleShipmentArrival({
      shipmentId: shipment.shipmentId,
      orderId: order.orderId
    });
    expect(buyerWalletAfter.balance).toBe(5000);
    expect(producerWalletAfter.balance).toBe(1000);
    expect(producerInv.items['wheat'].totalQuantity).toBe(200);
  });

  test('5. CommerceAutomationRegression — disabled CommerceAutomation cannot run parallel unpaid cycles', () => {
    commerceAutomation.setEnabled(false);

    const producerId = 'legacy-producer';
    const retailId = 'legacy-retail';

    inventoryManager.createInventory(`inv-${producerId}`, producerId, 1000);
    inventoryManager.addItemQuantity(`inv-${producerId}`, 'wheat', 500, 'kg');
    worldEngine.workplaceRepository.create({
      id: producerId,
      type: WorkplaceType.FARM,
      regionId: 'reg-1',
      locationId: 'loc-p',
      capacity: 10,
      occupiedPositions: 2,
      vacancies: 8,
      positions: [],
      inventoryId: `inv-${producerId}`,
      storageCapacity: 1000
    });

    inventoryManager.createInventory(`inv-${retailId}`, retailId, 1000);
    worldEngine.workplaceRepository.create({
      id: retailId,
      type: WorkplaceType.RETAIL,
      regionId: 'reg-1',
      locationId: 'loc-r',
      capacity: 10,
      occupiedPositions: 2,
      vacancies: 8,
      positions: [],
      inventoryId: `inv-${retailId}`,
      storageCapacity: 1000,
      metadata: { storeType: 'GROCERY' }
    });

    // Run commerce cycle
    commerceAutomation.runCommerceCycle();

    // No unpaid orders should be created
    const orders = supplyChainEngine.getOrdersForBusiness(retailId);
    expect(orders.length).toBe(0);
    expect(supplyChainEngine.getAllActiveShipments().length).toBe(0);
    // Producer inventory must remain intact
    expect(inventoryManager.getInventory(`inv-${producerId}`)!.items['wheat'].totalQuantity).toBe(500);
  });

  test('6. ProductionCostCalculatorInitialization — price formation uses calculator synchronously without async race', () => {
    const priceFormation = new PriceFormationService(
      worldEngine,
      inventoryManager,
      (productId: string) => ({ id: productId, name: productId, category: 'FOOD', unit: 'kg', basePrice: 10 } as any)
    );

    // Inject calculator directly and verify pricing functions immediately
    priceFormation.setProductionCostCalculator(financialEngine.productionCostCalculator);

    const breakdown = priceFormation.calculatePrice('wheat', 'reg-1', 1.0, 0, 10);
    expect(breakdown).toBeDefined();
    expect(breakdown.retailPrice).toBeGreaterThan(0);
    expect(breakdown.wholesaleUnitPrice).toBeGreaterThan(0);
  });
});
