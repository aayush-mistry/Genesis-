import { InventoryManager } from '../InventoryManager';
import { SpoilageLedger } from '../SpoilageLedger';
import { WorldEngine } from '../../world/WorldEngine';
import { FinancialEngine } from '../../finance/FinancialEngine';
import { MarketEngine } from '../../market/MarketEngine';
import { EventScheduler } from '../../events/EventScheduler';
import { TimeEngine } from '../../time/TimeEngine';
import { TransactionType, WorkplaceType } from '@genesis/shared';

describe('Task 1 — Inventory Spoilage Accounting & Auditing', () => {
  let inventoryManager: InventoryManager;
  let spoilageLedger: SpoilageLedger;
  let worldEngine: WorldEngine;
  let timeEngine: TimeEngine;
  let eventScheduler: EventScheduler;
  let marketEngine: MarketEngine;
  let financialEngine: FinancialEngine;

  beforeEach(() => {
    inventoryManager = new InventoryManager();
    spoilageLedger = new SpoilageLedger();
    inventoryManager.setSpoilageLedger(spoilageLedger);

    worldEngine = new WorldEngine();
    timeEngine = new TimeEngine();
    eventScheduler = new EventScheduler(timeEngine);
    marketEngine = new MarketEngine(worldEngine, timeEngine, eventScheduler);
    financialEngine = new FinancialEngine(worldEngine, marketEngine, eventScheduler, timeEngine);

    // Setup dummy workplace with wallet and inventory
    worldEngine.workplaceRepository.create({
      id: 'workplace-shop-1',
      type: WorkplaceType.SHOP,
      locationId: 'loc-1',
      regionId: 'reg-1',
      capacity: 10,
      occupiedPositions: 0,
      vacancies: 10,
      positions: [],
      inventoryId: 'inv-shop-1',
      wallet: {
        id: 'wallet-shop-1',
        ownerId: 'workplace-shop-1',
        balance: 5000,
        currency: 'GEN',
        totalIncome: 0,
        totalExpenses: 0
      }
    });

    inventoryManager.createInventory('inv-shop-1', 'workplace-shop-1', 1000);
  });

  test('1. Full batch expiry produces auditable SpoilageRecord and removes physical stock', () => {
    const acquiredAt = 1000;
    const expiryAt = 5000;
    const unitCost = 12.5;

    inventoryManager.addItemQuantity('inv-shop-1', 'wheat', 100, 'kg', acquiredAt, expiryAt, unitCost);

    const currentTime = 5500;
    const records = inventoryManager.removeExpiredItems(currentTime);

    expect(records.length).toBe(1);
    const rec = records[0];
    expect(rec.inventoryId).toBe('inv-shop-1');
    expect(rec.ownerId).toBe('workplace-shop-1');
    expect(rec.productId).toBe('wheat');
    expect(rec.quantity).toBe(100);
    expect(rec.unit).toBe('kg');
    expect(rec.batchAcquiredAt).toBe(acquiredAt);
    expect(rec.batchExpiryAt).toBe(expiryAt);
    expect(rec.timestamp).toBe(currentTime);
    expect(rec.unitPrice).toBe(12.5);
    expect(rec.totalLoss).toBe(1250);
    expect(rec.valuationUnavailable).toBe(false);
    expect(rec.valuationMethod).toBe('BATCH_COST');
    expect(rec.id).toBe('SPOIL-inv-shop-1-wheat-1000-5000');

    // Physical inventory should be 0 and cleaned up
    const inv = inventoryManager.getInventory('inv-shop-1')!;
    expect(inv.items['wheat']).toBeUndefined();

    // SpoilageLedger should contain the record
    expect(spoilageLedger.count()).toBe(1);
    expect(spoilageLedger.hasRecord(rec.id)).toBe(true);
    expect(spoilageLedger.getTotalLoss('workplace-shop-1', 'wheat')).toBe(1250);
    expect(spoilageLedger.getTotalSpoiledQuantity('wheat')).toBe(100);
  });

  test('2. Partial batch expiry reduces batch quantity without destroying fresh remainder', () => {
    inventoryManager.addItemQuantity('inv-shop-1', 'raw_fish', 50, 'kg', 1000, 3000, 20);

    // Spoil partial quantity (20 out of 50)
    const partialRecord = inventoryManager.spoilBatchQuantity('inv-shop-1', 'raw_fish', 0, 20, 2500);

    expect(partialRecord).not.toBeNull();
    expect(partialRecord!.quantity).toBe(20);
    expect(partialRecord!.unitPrice).toBe(20);
    expect(partialRecord!.totalLoss).toBe(400);

    const inv = inventoryManager.getInventory('inv-shop-1')!;
    const item = inv.items['raw_fish'];
    expect(item).toBeDefined();
    expect(item.totalQuantity).toBe(30);
    expect(item.batches!.length).toBe(1);
    expect(item.batches![0].quantity).toBe(30);
    expect(item.batches![0].status).toBe('FRESH');

    // Spoil remaining 30 units
    const fullRecord = inventoryManager.spoilBatchQuantity('inv-shop-1', 'raw_fish', 0, 30, 3100);
    expect(fullRecord).not.toBeNull();
    expect(fullRecord!.quantity).toBe(30);
    expect(inv.items['raw_fish']).toBeUndefined();
  });

  test('3. Multiple batches expiring simultaneously across products are all accounted for', () => {
    // 2 wheat batches and 1 fish batch expiring at or before 5000
    inventoryManager.addItemQuantity('inv-shop-1', 'wheat', 40, 'kg', 1000, 4000, 10);
    inventoryManager.addItemQuantity('inv-shop-1', 'wheat', 60, 'kg', 2000, 5000, 10);
    inventoryManager.addItemQuantity('inv-shop-1', 'raw_fish', 25, 'kg', 1500, 3500, 15);
    // 1 future wheat batch that does NOT expire yet
    inventoryManager.addItemQuantity('inv-shop-1', 'wheat', 80, 'kg', 3000, 9000, 10);

    const records = inventoryManager.removeExpiredItems(5000);
    expect(records.length).toBe(3);

    const spoiledProducts = records.map(r => r.productId);
    expect(spoiledProducts).toContain('wheat');
    expect(spoiledProducts).toContain('raw_fish');

    const totalWheatSpoiled = records.filter(r => r.productId === 'wheat').reduce((sum, r) => sum + r.quantity, 0);
    expect(totalWheatSpoiled).toBe(100);

    const inv = inventoryManager.getInventory('inv-shop-1')!;
    expect(inv.items['wheat'].totalQuantity).toBe(80);
    expect(inv.items['raw_fish']).toBeUndefined();
  });

  test('4. Valuation via ValuationResolver when batch has no unitCost', () => {
    // Valuation resolver simulates finding recent purchase or commodity price
    inventoryManager.setValuationResolver((productId, ownerId, quantity) => {
      if (productId === 'wheat') {
        return {
          unitPrice: 11.0,
          totalLoss: 11.0 * quantity,
          valuationMethod: 'HISTORICAL_TRANSACTION'
        };
      }
      return null;
    });

    inventoryManager.addItemQuantity('inv-shop-1', 'wheat', 50, 'kg', 1000, 2000); // No unitCost provided

    const records = inventoryManager.removeExpiredItems(2500);
    expect(records.length).toBe(1);
    expect(records[0].unitPrice).toBe(11.0);
    expect(records[0].totalLoss).toBe(550.0);
    expect(records[0].valuationUnavailable).toBe(false);
    expect(records[0].valuationMethod).toBe('HISTORICAL_TRANSACTION');
  });

  test('5. Zero-value / unavailable valuation is explicitly marked and does NOT fabricate arbitrary cost', () => {
    // No valuationResolver and batch has no unitCost
    inventoryManager.addItemQuantity('inv-shop-1', 'exotic_spice', 10, 'kg', 1000, 2000);

    const records = inventoryManager.removeExpiredItems(2500);
    expect(records.length).toBe(1);
    const rec = records[0];
    expect(rec.productId).toBe('exotic_spice');
    expect(rec.quantity).toBe(10);
    expect(rec.unitPrice).toBeNull();
    expect(rec.totalLoss).toBeNull();
    expect(rec.valuationUnavailable).toBe(true);
    expect(rec.valuationMethod).toBe('UNAVAILABLE');

    // Physical stock still removed accurately
    expect(inventoryManager.getInventory('inv-shop-1')!.items['exotic_spice']).toBeUndefined();
  });

  test('6. Idempotency: re-running removeExpiredItems on the same tick does not duplicate records or removals', () => {
    inventoryManager.addItemQuantity('inv-shop-1', 'wheat', 100, 'kg', 1000, 2000, 10);

    const firstRun = inventoryManager.removeExpiredItems(2500);
    expect(firstRun.length).toBe(1);
    expect(spoilageLedger.count()).toBe(1);

    // Second run at the same tick
    const secondRun = inventoryManager.removeExpiredItems(2500);
    expect(secondRun.length).toBe(0);
    expect(spoilageLedger.count()).toBe(1); // No new records

    // Trying to re-record the same record directly into SpoilageLedger returns false
    const duplicateInserted = spoilageLedger.record(firstRun[0]);
    expect(duplicateInserted).toBe(false);
    expect(spoilageLedger.count()).toBe(1);
  });

  test('7. Spoilage event integration with FinancialEngine and BusinessAccounting', () => {
    inventoryManager.addItemQuantity('inv-shop-1', 'wheat', 100, 'kg', 1000, 2000, 10);

    const records = inventoryManager.removeExpiredItems(2500);
    expect(records.length).toBe(1);

    // Emit event as supply.service does
    eventScheduler.emitter.emit('InventorySpoiled', records[0]);

    // FinancialEngine.ledger should have recorded transaction
    const txId = `TX-${records[0].id}`;
    const tx = financialEngine.ledger.getTransaction(txId);
    expect(tx).toBeDefined();
    expect(tx!.transactionType).toBe(TransactionType.INVENTORY_SPOILAGE);
    expect(tx!.buyerId).toBe('workplace-shop-1');
    expect(tx!.sellerId).toBe('SYSTEM_SPOILAGE');
    expect(tx!.totalPrice).toBe(1000);
    expect(tx!.referenceType).toBe('INVENTORY_SPOILAGE');

    // BusinessAccounting should have tracked spoilageLosses without deducting cash from wallet
    const workplace = worldEngine.workplaceRepository.findById('workplace-shop-1')!;
    expect(workplace.wallet!.balance).toBe(5000); // Balance untouched! No double-deduction!

    // Close period
    financialEngine.accounting.closeAccountingPeriod('workplace-shop-1', 1000, 3000);
    expect(workplace.accounting!.history.length).toBe(1);
    expect(workplace.accounting!.history[0].spoilageLosses).toBe(1000);
    expect(workplace.wallet!.balance).toBe(5000); // Still 5000
  });

  test('8. Ordinary consumption does NOT trigger spoilage accounting', () => {
    inventoryManager.addItemQuantity('inv-shop-1', 'wheat', 100, 'kg', 1000, 8000, 10);

    // Normal usage / consumption
    const removed = inventoryManager.removeItemQuantity('inv-shop-1', 'wheat', 30);
    expect(removed).toBe(true);

    const inv = inventoryManager.getInventory('inv-shop-1')!;
    expect(inv.items['wheat'].totalQuantity).toBe(70);

    // Spoilage ledger must have 0 records
    expect(spoilageLedger.count()).toBe(0);
    expect(spoilageLedger.getTotalLoss()).toBe(0);
  });
});
