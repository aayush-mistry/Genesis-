import { WorldEngine } from '../../world/WorldEngine';
import { TimeEngine } from '../../time/TimeEngine';
import { EventScheduler } from '../../events/EventScheduler';
import { InventoryManager } from '../../inventory/InventoryManager';
import { MarketEngine } from '../MarketEngine';
import { PriceFormationService } from '../PriceFormationService';
import { ProductionCostCalculator } from '../../finance/ProductionCostCalculator';
import { CandidateGenerator } from '../../decision/CandidateGenerator';
import { HardConstraintFilter } from '../../decision/utility/evaluators/HardConstraintFilter';
import { PersonalityUtilityEvaluator } from '../../decision/utility/evaluators/PersonalityUtilityEvaluator';
import { Commodity, ProductCategory, WorkplaceType, NeedUrgencyLevel, ActionType } from '@genesis/shared';

describe('T7.8.5 — Economic Equilibrium & Feedback Integration', () => {
  let worldEngine: WorldEngine;
  let timeEngine: TimeEngine;
  let eventScheduler: EventScheduler;
  let inventoryManager: InventoryManager;
  let marketEngine: MarketEngine;
  let priceFormationService: PriceFormationService;
  let productionCostCalculator: ProductionCostCalculator;
  let candidateGenerator: CandidateGenerator;
  let hardConstraintFilter: HardConstraintFilter;
  let personalityEvaluator: PersonalityUtilityEvaluator;

  const commodities: Record<string, Commodity> = {
    wheat: { id: 'wheat', name: 'Wheat', category: ProductCategory.FOOD, unit: 'kg', basePrice: 10, isBiological: true, consumable: { restorationNeed: 'HUNGER', restorationValue: 20 } },
    water: { id: 'water', name: 'Water', category: ProductCategory.FOOD, unit: 'L', basePrice: 2, isBiological: true, consumable: { restorationNeed: 'THIRST', restorationValue: 25 } },
    raw_fish: { id: 'raw_fish', name: 'Raw Fish', category: ProductCategory.FOOD, unit: 'kg', basePrice: 15, isBiological: true, consumable: { restorationNeed: 'HUNGER', restorationValue: 30 } }
  };

  beforeEach(() => {
    worldEngine = new WorldEngine();
    timeEngine = new TimeEngine();
    eventScheduler = new EventScheduler(timeEngine);
    inventoryManager = new InventoryManager();
    productionCostCalculator = new ProductionCostCalculator(worldEngine);
    candidateGenerator = new CandidateGenerator();
    hardConstraintFilter = new HardConstraintFilter();
    personalityEvaluator = new PersonalityUtilityEvaluator();

    priceFormationService = new PriceFormationService(
      worldEngine,
      inventoryManager,
      (productId: string) => commodities[productId],
      undefined,
      productionCostCalculator
    );

    marketEngine = new MarketEngine(worldEngine, timeEngine, eventScheduler);
    marketEngine.setPriceFormationService(priceFormationService);
  });

  describe('1. Producer Pricing Based on Real Production Costs', () => {
    it('calculates unit production cost from actual labor and inputs', () => {
      const farm = {
        id: 'producer-farm-1',
        type: WorkplaceType.FARM,
        regionId: 'reg-farm',
        capacity: 10,
        occupiedPositions: 2,
        vacancies: 8,
        positions: [
          { id: 'p1', type: 'FARMER', workplaceId: 'producer-farm-1', occupantId: 'c1' },
          { id: 'p2', type: 'FARMER', workplaceId: 'producer-farm-1', occupantId: 'c2' }
        ],
        wallet: { id: 'w1', ownerId: 'producer-farm-1', balance: 5000, currency: 'INR', totalIncome: 0, totalExpenses: 0 }
      };
      worldEngine.workplaceRepository.create(farm as any);

      // Monthly cost per farmer: 1500 * 1.1 = 1650. Daily labor cost: (1650 * 2) / 30 = 110.
      const costResult = productionCostCalculator.calculateCost(farm.id, {});
      expect(costResult.laborCost).toBeCloseTo(110);
      expect(costResult.totalCost).toBeCloseTo(110);

      // Capacity = 10 -> estimated daily yield = 100.
      // Unit production cost = 110 / 100 = 1.10.
      const unitCost = priceFormationService.estimateProducerUnitCost('wheat', 'reg-farm');
      expect(unitCost).toBe(1.10);
    });

    it('enforces producer reservation price as floor for wholesale price without double-compounding', () => {
      const farm = {
        id: 'producer-farm-2',
        type: WorkplaceType.FARM,
        regionId: 'reg-floor',
        capacity: 10,
        occupiedPositions: 1,
        vacancies: 9,
        positions: [
          { id: 'p1', type: 'FARMER', workplaceId: 'producer-farm-2', occupantId: 'c1' }
        ],
        wallet: { id: 'w2', ownerId: 'producer-farm-2', balance: 5000, currency: 'INR', totalIncome: 0, totalExpenses: 0 }
      };
      worldEngine.workplaceRepository.create(farm as any);

      const breakdown = priceFormationService.calculatePrice('wheat', 'reg-floor');
      expect(breakdown.producerReservationPrice).toBeDefined();
      expect(breakdown.producerReservationPrice).toBeGreaterThan(0);
      // Wholesale unit price must not fall below producer reservation price
      expect(breakdown.wholesaleUnitPrice).toBeGreaterThanOrEqual(breakdown.producerReservationPrice!);
    });

    it('handles missing cost data gracefully without fabricating costs', () => {
      // In a region with no producers
      const unitCost = priceFormationService.estimateProducerUnitCost('wheat', 'unpopulated-region');
      expect(unitCost).toBeUndefined();

      const breakdown = priceFormationService.calculatePrice('wheat', 'unpopulated-region');
      expect(breakdown.producerReservationPrice).toBeUndefined();
      expect(breakdown.productionCostReference).toBeUndefined();
      expect(breakdown.retailPrice).toBe(10); // Standard reference price preserved
    });
  });

  describe('2. Citizen Price Elasticity & Commodity Substitution', () => {
    it('generates both primary and substitute candidates for urgent food need', () => {
      const context = {
        citizenId: 'cit-hungry',
        walletBalance: 200,
        stockLevels: { wheat: 0, raw_fish: 0 },
        perception: { nearbyResources: [], nearbyBuildings: [] }
      };

      const needState = {
        needType: 'HUNGER' as const,
        rawValue: 85,
        urgency: 85,
        level: NeedUrgencyLevel.CRITICAL
      };

      const candidates = candidateGenerator.generateCandidates(context as any, [needState]);
      const purchaseCandidates = candidates.filter(c => c.type === ActionType.PURCHASE);
      
      expect(purchaseCandidates.length).toBe(2);
      expect(purchaseCandidates.some(c => c.metadata?.productId === 'wheat')).toBe(true);
      expect(purchaseCandidates.some(c => c.metadata?.productId === 'raw_fish')).toBe(true);
    });

    it('rejects unaffordable substitute through HardConstraintFilter', () => {
      // Citizen has 105 INR
      // Wheat cost = 10 * 10 = 100 INR (affordable)
      // Raw fish cost = 7 * 15 = 105 INR (affordable)
      // If citizen has only 102 INR, fish is unaffordable (105 > 102) while wheat is affordable (100 <= 102)
      const context = {
        walletBalance: 102
      };

      const wheatAction = {
        type: ActionType.PURCHASE,
        metadata: { productId: 'wheat', targetQuantity: 10, expectedPrice: 10 }
      };

      const fishAction = {
        type: ActionType.PURCHASE,
        metadata: { productId: 'raw_fish', targetQuantity: 7, expectedPrice: 15 }
      };

      expect(hardConstraintFilter.isValid(wheatAction as any, context as any)).toBe(true);
      expect(hardConstraintFilter.isValid(fishAction as any, context as any)).toBe(false);
    });

    it('price-sensitive citizen prioritizes cheaper commodity in utility evaluation', () => {
      const contextPriceSensitive = {
        personality: { priceSensitivity: 90, qualityPreference: 10, conveniencePreference: 50 }
      };

      const wheatAction = {
        type: ActionType.PURCHASE,
        metadata: { productId: 'wheat', expectedPrice: 10 }
      };

      const fishAction = {
        type: ActionType.PURCHASE,
        metadata: { productId: 'raw_fish', expectedPrice: 15 }
      };

      const wheatScore = personalityEvaluator.evaluate(wheatAction as any, contextPriceSensitive as any);
      const fishScore = personalityEvaluator.evaluate(fishAction as any, contextPriceSensitive as any);

      // Cheaper wheat receives less price penalty -> higher overall score
      expect(wheatScore).toBeGreaterThan(fishScore);
    });
  });
});
