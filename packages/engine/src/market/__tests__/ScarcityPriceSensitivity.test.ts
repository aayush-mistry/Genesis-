import { WorldEngine } from '../../world/WorldEngine';
import { TimeEngine } from '../../time/TimeEngine';
import { EventScheduler } from '../../events/EventScheduler';
import { InventoryManager } from '../../inventory/InventoryManager';
import { MarketEngine } from '../MarketEngine';
import { PriceFormationService } from '../PriceFormationService';
import { Commodity, ProductCategory, WorkplaceType } from '@genesis/shared';

describe('T8.6.5.1 Task 3 — Scarcity Price Sensitivity & Dynamic Pricing', () => {
  let worldEngine: WorldEngine;
  let timeEngine: TimeEngine;
  let eventScheduler: EventScheduler;
  let inventoryManager: InventoryManager;
  let marketEngine: MarketEngine;
  let priceFormationService: PriceFormationService;

  const commodities: Record<string, Commodity> = {
    wheat: { id: 'wheat', name: 'Wheat', category: ProductCategory.FOOD, unit: 'kg', basePrice: 10, isBiological: true },
    water: { id: 'water', name: 'Water', category: ProductCategory.FOOD, unit: 'L', basePrice: 2, isBiological: true },
    tools: { id: 'tools', name: 'Tools', category: ProductCategory.RAW_MATERIAL, unit: 'item', basePrice: 50, isBiological: false }
  };

  beforeEach(() => {
    worldEngine = new WorldEngine();
    timeEngine = new TimeEngine();
    eventScheduler = new EventScheduler(timeEngine);
    inventoryManager = new InventoryManager();

    marketEngine = new MarketEngine(worldEngine, timeEngine, eventScheduler);

    priceFormationService = new PriceFormationService(
      worldEngine,
      inventoryManager,
      (productId: string) => commodities[productId],
      {
        minPriceMultiplier: 0.5,
        maxPriceMultiplier: 2.5,
        dampingFactor: 0.2,
        wholesaleDiscountPercent: 0.15,
        producerTargetMarginPercent: 0.10
      }
    );

    marketEngine.setPriceFormationService(priceFormationService);
  });

  it('1. Reaches configured maxPriceMultiplier (2.5x) at absolute zero inventory', () => {
    // Workplace capacity = 10 -> baseline target stock = 200
    const wp = {
      id: 'shop-zero-stock',
      type: WorkplaceType.SHOP,
      regionId: 'reg-scarcity',
      capacity: 10,
      inventoryId: 'inv-zero',
      wallet: { balance: 1000, totalIncome: 0, totalExpenses: 0, currency: 'INR' }
    };
    worldEngine.workplaceRepository.create(wp as any);
    inventoryManager.createInventory('inv-zero', 'shop-zero-stock', 1000);
    // 0 inventory added

    const breakdown = priceFormationService.calculatePrice('wheat', 'reg-scarcity');
    // At zero inventory: ratio = 0.0 -> factor must equal maxPriceMultiplier = 2.5
    expect(breakdown.scarcitySurplusFactor).toBe(2.5);
    expect(breakdown.retailPrice).toBe(25); // 10 * 2.5 = 25
    expect(breakdown.wholesaleUnitPrice).toBe(21.25); // 25 * (1 - 0.15) = 21.25
  });

  it('2. Scales smoothly and responsively under severe shortage conditions', () => {
    // Baseline target stock = 200. Inventory = 20 (10% of normal stock)
    const wp = {
      id: 'shop-shortage',
      type: WorkplaceType.SHOP,
      regionId: 'reg-shortage',
      capacity: 10,
      inventoryId: 'inv-shortage',
      wallet: { balance: 1000, totalIncome: 0, totalExpenses: 0, currency: 'INR' }
    };
    worldEngine.workplaceRepository.create(wp as any);
    inventoryManager.createInventory('inv-shortage', 'shop-shortage', 1000);
    inventoryManager.addItemQuantity('inv-shortage', 'wheat', 20, 'kg');

    const breakdown = priceFormationService.calculatePrice('wheat', 'reg-shortage');
    // ratio = 20 / 200 = 0.10. Expected factor = 1.0 + (1.0 - 0.10) * 1.5 = 1.0 + 1.35 = 2.35
    expect(breakdown.scarcitySurplusFactor).toBe(2.35);
    expect(breakdown.retailPrice).toBe(23.5);
    expect(breakdown.wholesaleUnitPrice).toBe(19.97); // 23.5 * 0.85 = 19.975 -> toFixed(2) = 19.97
  });

  it('3. Produces neutral factor 1.0 when inventory precisely matches baseline target stock', () => {
    // Baseline target stock = 200. Inventory = 200 (100% of normal stock)
    const wp = {
      id: 'shop-normal',
      type: WorkplaceType.SHOP,
      regionId: 'reg-normal',
      capacity: 10,
      inventoryId: 'inv-normal',
      wallet: { balance: 1000, totalIncome: 0, totalExpenses: 0, currency: 'INR' }
    };
    worldEngine.workplaceRepository.create(wp as any);
    inventoryManager.createInventory('inv-normal', 'shop-normal', 1000);
    inventoryManager.addItemQuantity('inv-normal', 'wheat', 200, 'kg');

    const breakdown = priceFormationService.calculatePrice('wheat', 'reg-normal');
    expect(breakdown.scarcitySurplusFactor).toBe(1.0);
    expect(breakdown.retailPrice).toBe(10);
    expect(breakdown.wholesaleUnitPrice).toBe(8.5); // 10 * 0.85 = 8.5
  });

  it('4. Dampens surplus inventory smoothly towards minPriceMultiplier (0.5x)', () => {
    // Baseline target stock = 200. Inventory = 700 (350% of normal stock -> ratio = 3.5)
    // rawFactor = 1.0 - (3.5 - 1.0) * 0.2 = 1.0 - 0.5 = 0.5 (hits min floor)
    const wp = {
      id: 'shop-surplus',
      type: WorkplaceType.SHOP,
      regionId: 'reg-surplus',
      capacity: 10,
      inventoryId: 'inv-surplus',
      wallet: { balance: 1000, totalIncome: 0, totalExpenses: 0, currency: 'INR' }
    };
    worldEngine.workplaceRepository.create(wp as any);
    inventoryManager.createInventory('inv-surplus', 'shop-surplus', 2000);
    inventoryManager.addItemQuantity('inv-surplus', 'wheat', 700, 'kg');

    const breakdown = priceFormationService.calculatePrice('wheat', 'reg-surplus');
    expect(breakdown.scarcitySurplusFactor).toBe(0.5);
    expect(breakdown.retailPrice).toBe(5); // 10 * 0.5 = 5
    expect(breakdown.wholesaleUnitPrice).toBe(4.25); // 5 * 0.85 = 4.25
  });

  it('5. Strictly clamps surplus below minPriceMultiplier and never falls below configured floor', () => {
    // Extreme glut: Inventory = 2000 (ratio = 10.0)
    // rawFactor = 1.0 - (10 - 1) * 0.2 = -0.8 -> clamped to minPriceMultiplier 0.5
    const wp = {
      id: 'shop-glut',
      type: WorkplaceType.SHOP,
      regionId: 'reg-glut',
      capacity: 10,
      inventoryId: 'inv-glut',
      wallet: { balance: 1000, totalIncome: 0, totalExpenses: 0, currency: 'INR' }
    };
    worldEngine.workplaceRepository.create(wp as any);
    inventoryManager.createInventory('inv-glut', 'shop-glut', 5000);
    inventoryManager.addItemQuantity('inv-glut', 'wheat', 2000, 'kg');

    const breakdown = priceFormationService.calculatePrice('wheat', 'reg-glut');
    expect(breakdown.scarcitySurplusFactor).toBe(0.5);
    expect(breakdown.retailPrice).toBe(5);
  });

  it('6. Respects custom configured maxPriceMultiplier and minPriceMultiplier bounds', () => {
    const customService = new PriceFormationService(
      worldEngine,
      inventoryManager,
      (productId: string) => commodities[productId],
      {
        minPriceMultiplier: 0.3,
        maxPriceMultiplier: 3.0,
        dampingFactor: 0.2,
        wholesaleDiscountPercent: 0.10
      }
    );

    const wp = {
      id: 'shop-custom',
      type: WorkplaceType.SHOP,
      regionId: 'reg-custom',
      capacity: 10,
      inventoryId: 'inv-custom',
      wallet: { balance: 1000, totalIncome: 0, totalExpenses: 0, currency: 'INR' }
    };
    worldEngine.workplaceRepository.create(wp as any);
    inventoryManager.createInventory('inv-custom', 'shop-custom', 1000);

    // 0 stock -> should hit custom maxPriceMultiplier 3.0
    const zeroBreakdown = customService.calculatePrice('wheat', 'reg-custom');
    expect(zeroBreakdown.scarcitySurplusFactor).toBe(3.0);
    expect(zeroBreakdown.retailPrice).toBe(30);
    expect(zeroBreakdown.wholesaleUnitPrice).toBe(27); // 30 * (1 - 0.10) = 27
  });

  it('7. Handles missing inventory data gracefully without inventing demand or stock', () => {
    // Unpopulated region with 0 workplaces
    const breakdown = priceFormationService.calculatePrice('wheat', 'unpopulated-wilderness');
    expect(breakdown.scarcitySurplusFactor).toBe(1.0);
    expect(breakdown.retailPrice).toBe(10);
    expect(breakdown.wholesaleUnitPrice).toBe(8.5);
    expect(breakdown.inventoryAvailable).toBe(0);
    expect(breakdown.targetDemand).toBe(0);
  });
});
