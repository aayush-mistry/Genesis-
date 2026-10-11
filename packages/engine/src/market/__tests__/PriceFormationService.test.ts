import { WorldEngine } from '../../world/WorldEngine';
import { TimeEngine } from '../../time/TimeEngine';
import { EventScheduler } from '../../events/EventScheduler';
import { InventoryManager } from '../../inventory/InventoryManager';
import { MarketEngine } from '../MarketEngine';
import { PriceFormationService } from '../PriceFormationService';
import { Commodity, ProductCategory, WorkplaceType, TransactionType } from '@genesis/shared';

describe('T7.8.4 - Price Dynamics & Formation Engine', () => {
  let worldEngine: WorldEngine;
  let timeEngine: TimeEngine;
  let eventScheduler: EventScheduler;
  let inventoryManager: InventoryManager;
  let marketEngine: MarketEngine;
  let priceFormationService: PriceFormationService;

  const commodities: Record<string, Commodity> = {
    wheat: { id: 'wheat', name: 'Wheat', category: ProductCategory.FOOD, unit: 'kg', basePrice: 10, isBiological: true },
    water: { id: 'water', name: 'Water', category: ProductCategory.FOOD, unit: 'L', basePrice: 2, isBiological: true },
    raw_fish: { id: 'raw_fish', name: 'Raw Fish', category: ProductCategory.FOOD, unit: 'kg', basePrice: 15, isBiological: true }
  };

  beforeEach(() => {
    worldEngine = new WorldEngine();
    timeEngine = new TimeEngine();
    eventScheduler = new EventScheduler(timeEngine);
    inventoryManager = new InventoryManager();

    marketEngine = new MarketEngine(
      worldEngine,
      timeEngine,
      eventScheduler
    );

    priceFormationService = new PriceFormationService(
      worldEngine,
      inventoryManager,
      (productId: string) => commodities[productId]
    );

    marketEngine.setPriceFormationService(priceFormationService);
  });

  it('1. Normal purchase charges the correct current retail price', () => {
    // Reference price for wheat is 10
    const price = marketEngine.calculateEffectivePrice('wheat', 'DEFAULT', 10);
    expect(price).toBe(10);

    const breakdown = marketEngine.getPriceBreakdown('wheat', 'DEFAULT');
    expect(breakdown.referencePrice).toBe(10);
    expect(breakdown.retailPrice).toBe(10);
    expect(breakdown.unit).toBe('kg');
    expect(breakdown.currency).toBe('INR');
  });

  it('2. Wholesale purchase uses the correct bulk price with discount', () => {
    const breakdown = marketEngine.getPriceBreakdown('wheat', 'DEFAULT', 100);
    expect(breakdown.wholesaleUnitPrice).toBeLessThan(breakdown.retailPrice);
    // Standard wholesale discount is 15% -> 10 * 0.85 = 8.5
    expect(breakdown.wholesaleUnitPrice).toBe(8.5);
  });

  it('3. Scarcity adjustment increases prices within bounded limits', () => {
    // Setup a shop workplace with capacity 10 (target baseline stock = 200), but only 10 in inventory
    const wp = {
      id: 'shop-1',
      type: WorkplaceType.SHOP,
      regionId: 'reg-1',
      capacity: 10,
      inventoryId: 'inv-1',
      wallet: { balance: 1000, totalIncome: 0, totalExpenses: 0, currency: 'INR' }
    };
    worldEngine.workplaceRepository.create(wp as any);
    inventoryManager.createInventory('inv-1', 'shop-1', 1000);
    inventoryManager.addItemQuantity('inv-1', 'wheat', 10, 'kg'); // Very low stock (5% of normal)

    const breakdown = priceFormationService.calculatePrice('wheat', 'reg-1');
    expect(breakdown.scarcitySurplusFactor).toBeGreaterThan(1.0);
    expect(breakdown.retailPrice).toBeGreaterThan(10);
    // Bounded maximum is 2.5
    expect(breakdown.scarcitySurplusFactor).toBeLessThanOrEqual(2.5);
  });

  it('4. Surplus adjustment reduces prices within bounded limits', () => {
    // Setup a shop workplace with capacity 10 (target baseline stock = 200), but with 1000 in inventory (500% of normal)
    const wp = {
      id: 'shop-2',
      type: WorkplaceType.SHOP,
      regionId: 'reg-2',
      capacity: 10,
      inventoryId: 'inv-2',
      wallet: { balance: 1000, totalIncome: 0, totalExpenses: 0, currency: 'INR' }
    };
    worldEngine.workplaceRepository.create(wp as any);
    inventoryManager.createInventory('inv-2', 'shop-2', 2000);
    inventoryManager.addItemQuantity('inv-2', 'wheat', 1000, 'kg');

    const breakdown = priceFormationService.calculatePrice('wheat', 'reg-2');
    expect(breakdown.scarcitySurplusFactor).toBeLessThan(1.0);
    expect(breakdown.retailPrice).toBeLessThan(10);
    // Bounded minimum is 0.5
    expect(breakdown.scarcitySurplusFactor).toBeGreaterThanOrEqual(0.5);
    expect(breakdown.retailPrice).toBeGreaterThanOrEqual(1.0);
  });

  it('5. Missing demand or supply data does not generate fake price changes', () => {
    // When region has no shops or baseline data, default factor is neutral 1.0
    const breakdown = priceFormationService.calculatePrice('wheat', 'unpopulated-region');
    expect(breakdown.scarcitySurplusFactor).toBe(1.0);
    expect(breakdown.retailPrice).toBe(10);
  });

  it('6. Repeated price calculations do not compound adjustments', () => {
    const calc1 = marketEngine.calculateEffectivePrice('wheat', 'DEFAULT', 10);
    const calc2 = marketEngine.calculateEffectivePrice('wheat', 'DEFAULT', 10);
    const calc3 = marketEngine.calculateEffectivePrice('wheat', 'DEFAULT', 10);

    expect(calc1).toBe(calc2);
    expect(calc2).toBe(calc3);
  });

  it('7. Regional adjustments are applied at most once', () => {
    marketEngine.setRegionalAdjustment({
      regionId: 'reg-north',
      productId: 'wheat',
      adjustmentMultiplier: 1.2,
      adjustmentOffset: 0
    });

    const price = marketEngine.calculateEffectivePrice('wheat', 'reg-north', 10);
    // 10 * 1.2 = 12
    expect(price).toBe(12);

    const breakdown = marketEngine.getPriceBreakdown('wheat', 'reg-north');
    expect(breakdown.regionalFactor).toBe(1.2);
    expect(breakdown.retailPrice).toBe(12);
  });

  it('8. Failed transactions do not transfer money or inventory', () => {
    const buyerWp = {
      id: 'buyer-broke',
      type: WorkplaceType.SHOP,
      wallet: { id: 'w-b', ownerId: 'buyer-broke', balance: 5, currency: 'INR', totalIncome: 0, totalExpenses: 0 }
    };
    const sellerWp = {
      id: 'seller-rich',
      type: WorkplaceType.WHOLESALE,
      wallet: { id: 'w-s', ownerId: 'seller-rich', balance: 100, currency: 'INR', totalIncome: 0, totalExpenses: 0 }
    };

    worldEngine.workplaceRepository.create(buyerWp as any);
    worldEngine.workplaceRepository.create(sellerWp as any);

    // Total price is 50, but buyer only has 5
    const tx = marketEngine.processTransaction(
      'buyer-broke',
      'seller-rich',
      'wheat',
      5,
      'kg',
      10,
      50,
      'INR',
      TransactionType.PURCHASE,
      'DEFAULT'
    );

    expect(tx).toBeNull();
    expect(buyerWp.wallet.balance).toBe(5);
    expect(sellerWp.wallet.balance).toBe(100);
  });

  it('9. Successful transactions conserve money and record exact charged price', () => {
    const buyerWp = {
      id: 'buyer-1',
      type: WorkplaceType.SHOP,
      wallet: { id: 'w-b1', ownerId: 'buyer-1', balance: 100, currency: 'INR', totalIncome: 0, totalExpenses: 0 }
    };
    const sellerWp = {
      id: 'seller-1',
      type: WorkplaceType.WHOLESALE,
      wallet: { id: 'w-s1', ownerId: 'seller-1', balance: 50, currency: 'INR', totalIncome: 0, totalExpenses: 0 }
    };

    worldEngine.workplaceRepository.create(buyerWp as any);
    worldEngine.workplaceRepository.create(sellerWp as any);

    const initialTotalMoney = buyerWp.wallet.balance + sellerWp.wallet.balance;

    const tx = marketEngine.processTransaction(
      'buyer-1',
      'seller-1',
      'wheat',
      2,
      'kg',
      12.5,
      25,
      'INR',
      TransactionType.PURCHASE,
      'DEFAULT'
    );

    expect(tx).not.toBeNull();
    expect(buyerWp.wallet.balance).toBe(75);
    expect(sellerWp.wallet.balance).toBe(75);
    expect(buyerWp.wallet.balance + sellerWp.wallet.balance).toBe(initialTotalMoney);

    // 10. Historical transaction prices remain unchanged after later price changes
    // Suppose tomorrow price doubles to 25
    marketEngine.setRegionalAdjustment({
      regionId: 'DEFAULT',
      productId: 'wheat',
      adjustmentMultiplier: 2.0,
      adjustmentOffset: 0
    });

    const recordedTx = marketEngine.getTransaction(tx!.transactionId);
    expect(recordedTx?.unitPrice).toBe(12.5);
    expect(recordedTx?.totalPrice).toBe(25);
  });

  it('11. Transportation landed cost calculation is accurate and accounts for distance', () => {
    const landed = priceFormationService.calculateLandedCost(10, 50, 100, 0.1);
    // Goods cost = 10 * 50 = 500
    // Transport cost = 50 * 100 * 0.1 = 500
    // Total landed cost = 1000
    // Effective unit price = 20
    expect(landed.goodsCost).toBe(500);
    expect(landed.transportCost).toBe(500);
    expect(landed.totalLandedCost).toBe(1000);
    expect(landed.effectiveUnitPrice).toBe(20);
  });
});
