import { ConsumptionEngine } from '../ConsumptionEngine';
import { ConsumptionLedger } from '../ConsumptionLedger';
import { InventoryManager } from '../../inventory/InventoryManager';
import { NeedsService } from '../../citizen/services/NeedsService';
import { InMemoryCitizenRepository } from '../../citizen/repositories/InMemoryCitizenRepository';
import { ResourceManager } from '../../resources/ResourceManager';
import { ResourceConsumptionEngine } from '../../resources/ResourceConsumptionEngine';
import { MarketEngine } from '../../market/MarketEngine';
import { CandidateGenerator } from '../../decision/CandidateGenerator';
import { BuildingManager } from '../../world/BuildingManager';
import { TimeEngine } from '../../time/TimeEngine';
import { EventScheduler } from '../../events/EventScheduler';
import {
  Citizen,
  CitizenGender,
  CitizenStatus,
  Commodity,
  ProductCategory,
  ResourceCategory,
  ResourceType,
  TransactionType,
  NeedUrgencyLevel,
  ActionType,
  DecisionContext
} from '@genesis/shared';

describe('Residential Water Infrastructure (T8.6.3)', () => {
  let inventoryManager: InventoryManager;
  let citizenRepo: InMemoryCitizenRepository;
  let needsService: NeedsService;
  let resourceManager: ResourceManager;
  let resourceConsumptionEngine: ResourceConsumptionEngine;
  let marketEngine: MarketEngine;
  let consumptionLedger: ConsumptionLedger;
  let consumptionEngine: ConsumptionEngine;
  let buildingManager: BuildingManager;
  let timeEngine: TimeEngine;
  let eventScheduler: EventScheduler;
  let candidateGenerator: CandidateGenerator;

  let citizen: Citizen;
  const regionId = 'reg-east-1';
  const buildingId = 'apt-complex-1';
  const householdId = 'hh-101';
  const householdInventoryId = 'inv-hh-101';

  beforeEach(() => {
    inventoryManager = new InventoryManager();
    citizenRepo = new InMemoryCitizenRepository();
    needsService = new NeedsService(citizenRepo);
    resourceManager = new ResourceManager();
    resourceConsumptionEngine = new ResourceConsumptionEngine(resourceManager);
    buildingManager = new BuildingManager();
    timeEngine = new TimeEngine();
    eventScheduler = new EventScheduler(timeEngine);
    consumptionLedger = new ConsumptionLedger();
    candidateGenerator = new CandidateGenerator();

    const mockWorldEngine: any = {
      workplaceRepository: { findById: () => undefined },
      buildingManager
    };

    marketEngine = new MarketEngine(
      mockWorldEngine,
      timeEngine,
      eventScheduler,
      (cId: string) => citizenRepo.findById(cId)?.wallet
    );

    const commodities: Record<string, Commodity> = {
      water: {
        id: 'water',
        name: 'Water',
        category: ProductCategory.FOOD,
        unit: 'L',
        basePrice: 0.05,
        isBiological: true,
        consumable: { restorationNeed: 'THIRST', restorationValue: 25 }
      },
      bottled_water: {
        id: 'bottled_water',
        name: 'Bottled Water',
        category: ProductCategory.FOOD,
        unit: 'L',
        basePrice: 2,
        isBiological: true,
        consumable: { restorationNeed: 'THIRST', restorationValue: 25 }
      }
    };

    consumptionEngine = new ConsumptionEngine(
      inventoryManager,
      needsService,
      (id: string) => commodities[id],
      consumptionLedger
    );

    consumptionEngine.setResourceConsumptionEngine(resourceConsumptionEngine);
    consumptionEngine.setMarketEngine(marketEngine);
    consumptionEngine.setWaterTariff(0.05); // 0.05 credits per Litre

    // Wire water connection checker
    consumptionEngine.setWaterConnectionChecker((c: Citizen) => {
      if (c.householdId !== householdId) return { connected: false };
      const isConnected = buildingManager.hasWaterConnection(buildingId);
      return { connected: isConnected, buildingId, regionId };
    });

    // Initialize regional water reservoir (100 m³)
    resourceManager.loadResource({
      id: 'res-water-1',
      name: 'Regional Aquifer',
      type: ResourceType.WATER,
      category: ResourceCategory.RENEWABLE,
      renewable: true,
      condition: null as any,
      regionId,
      coordinates: { x: 10, y: 10 },
      radius: 100,
      currentAmount: 100.0, // 100 m³ = 100,000 L
      maximumAmount: 100.0,
      naturalRecoveryRate: 0.1,
      consumptionRate: 0,
      extractionDifficulty: 1,
      tradable: true,
      borrowable: false,
      exportable: false,
      unit: 'm³',
      createdAt: new Date(),
      updatedAt: new Date()
    });

    // Create building with active water connection
    buildingManager.createBuilding({
      id: buildingId,
      name: 'Sunset Apartments',
      type: 'APARTMENT' as any,
      status: 'ACTIVE' as any,
      coordinates: { x: 15, y: 15 },
      capacity: 50,
      districtId: 'dist-1',
      metadata: { hasWaterConnection: true }
    });

    // Setup citizen
    citizen = {
      id: 'citizen-101',
      name: 'Alice',
      birthDate: { year: 1, month: 1, day: 1, hour: 0, minute: 0, second: 0 },
      gender: CitizenGender.FEMALE,
      status: CitizenStatus.ACTIVE,
      createdAt: { year: 1, month: 1, day: 1, hour: 0, minute: 0, second: 0 },
      locationId: buildingId,
      householdId,
      vitalState: {
        hunger: 20,
        thirst: 70, // Needs 70 - 20 = 50 thirst restoration (requires 2 L)
        energy: 100,
        health: 100,
        lastUpdatedSimulationTime: { year: 1, month: 1, day: 1, hour: 0, minute: 0, second: 0 }
      },
      wallet: {
        id: 'wallet-citizen-101',
        ownerId: 'citizen-101',
        balance: 50, // 50 credits
        currency: 'GEN',
        totalIncome: 0,
        totalExpenses: 0
      },
      movementState: 'IDLE' as any,
      activeRoute: null,
      skills: [],
      employmentStatus: 'EMPLOYED' as any,
      workplaceId: null,
      jobType: null,
      jobSchedule: null,
      personality: {
        priceSensitivity: 50,
        qualityPreference: 50,
        conveniencePreference: 50,
        planningTendency: 50,
        socialEngagement: 50,
        riskTolerance: 50,
        savingTendency: 50
      }
    };

    citizenRepo.create(citizen);
    inventoryManager.createInventory(householdInventoryId, householdId, 500);
  });

  describe('1. Litre to Cubic Metre Conversion', () => {
    it('should convert 500 L to exactly 0.5 m³ deduction from regional reservoir', () => {
      const initialResource = resourceManager.getResourceById(regionId, 'res-water-1')!;
      expect(initialResource.currentAmount).toBe(100.0);

      const result = resourceConsumptionEngine.extractDomesticWater(regionId, 500);
      expect(result.success).toBe(true);
      expect(result.requestedLitres).toBe(500);
      expect(result.extractedLitres).toBe(500);
      expect(result.extractedM3).toBe(0.5);

      const updatedResource = resourceManager.getResourceById(regionId, 'res-water-1')!;
      expect(updatedResource.currentAmount).toBe(99.5);
      expect(result.remainingRegionalWaterM3).toBe(99.5);
    });

    it('should convert 2 L to exactly 0.002 m³ deduction', () => {
      const result = resourceConsumptionEngine.extractDomesticWater(regionId, 2);
      expect(result.success).toBe(true);
      expect(result.extractedLitres).toBe(2);
      expect(result.extractedM3).toBe(0.002);

      const updatedResource = resourceManager.getResourceById(regionId, 'res-water-1')!;
      expect(updatedResource.currentAmount).toBe(99.998);
    });
  });

  describe('2. Depleted or Insufficient Regional Water', () => {
    it('should supply no water and return failure if reservoir is completely depleted', () => {
      resourceManager.updateResource(regionId, 'res-water-1', { currentAmount: 0 });

      const result = resourceConsumptionEngine.extractDomesticWater(regionId, 10);
      expect(result.success).toBe(false);
      expect(result.extractedLitres).toBe(0);
      expect(result.extractedM3).toBe(0);
      expect(result.remainingRegionalWaterM3).toBe(0);
      expect(result.failureReason).toBe('DEPLETED_RESERVOIR');

      // Attempting to consume tap water fails
      const consumed = consumptionEngine.consume(citizen, 'THIRST', 100);
      expect(consumed).toBe(false);
      expect(citizen.vitalState.thirst).toBe(70); // Unchanged
    });

    it('should never allow negative quantities and extract only what is physically available', () => {
      // Reservoir only has 0.001 m³ (1 L)
      resourceManager.updateResource(regionId, 'res-water-1', { currentAmount: 0.001 });

      const result = resourceConsumptionEngine.extractDomesticWater(regionId, 5); // citizen wants 5 L
      expect(result.success).toBe(true);
      expect(result.extractedLitres).toBe(1);
      expect(result.extractedM3).toBe(0.001);

      const updatedResource = resourceManager.getResourceById(regionId, 'res-water-1')!;
      expect(updatedResource.currentAmount).toBe(0);
      expect(updatedResource.currentAmount).toBeGreaterThanOrEqual(0);
    });
  });

  describe('3. Residential Connection Eligibility', () => {
    it('should allow tap water consumption when building has an active connection', () => {
      expect(buildingManager.hasWaterConnection(buildingId)).toBe(true);

      const success = consumptionEngine.consume(citizen, 'THIRST', 100);
      expect(success).toBe(true);
      expect(citizen.vitalState.thirst).toBeLessThan(70);
    });

    it('should reject tap water consumption when building water connection is disconnected', () => {
      buildingManager.setWaterConnection(buildingId, false);
      expect(buildingManager.hasWaterConnection(buildingId)).toBe(false);

      const success = consumptionEngine.consume(citizen, 'THIRST', 100);
      expect(success).toBe(false);
      expect(citizen.vitalState.thirst).toBe(70); // Thirst not fulfilled
    });

    it('should reject tap water consumption if citizen is unhoused', () => {
      citizen.householdId = undefined;

      const success = consumptionEngine.consume(citizen, 'THIRST', 100);
      expect(success).toBe(false);
      expect(citizen.vitalState.thirst).toBe(70);
    });

    it('should reject tap water consumption if citizen is away from residence', () => {
      citizen.locationId = 'retail-store-99';

      const success = consumptionEngine.consume(citizen, 'THIRST', 100);
      expect(success).toBe(false);
      expect(citizen.vitalState.thirst).toBe(70);
    });
  });

  describe('4. Tap Water Fulfilling Thirst with Empty Household Inventory', () => {
    it('should restore thirst proportionally and record a RESIDENTIAL_WATER consumption record', () => {
      // Household inventory has 0 water items
      const inv = inventoryManager.getInventory(householdInventoryId)!;
      expect(Object.keys(inv.items).length).toBe(0);

      // Thirst = 70. Target = 20. Required = 50. Restoration = 25/L -> 2 Litres required.
      const success = consumptionEngine.consume(citizen, 'THIRST', 100, undefined, 'evt-tap-1', 'TEST_TAP', regionId);
      expect(success).toBe(true);

      // Thirst should be satisfied: 70 - (2 * 25) = 20
      expect(citizen.vitalState.thirst).toBe(20);

      // Ledger should have recorded a RESIDENTIAL_WATER entry
      const records = consumptionLedger.getRecords().filter(r => r.consumerId === citizen.id);
      expect(records.length).toBe(1);
      expect(records[0].context).toBe('TEST_TAP');
      expect(records[0].commodityId).toBe('water');
      expect(records[0].quantity).toBe(2);
      expect(records[0].unit).toBe('L');
      expect(records[0].sourceInventoryId).toBeUndefined(); // piped tap water has no source inventory
    });
  });

  describe('5. Bottled-Water Consumption Priority', () => {
    it('should consume bottled water first when available in household inventory without touching tap water', () => {
      // Put 5 L of bottled water in household inventory
      inventoryManager.addItemQuantity(householdInventoryId, 'bottled_water', 5, 'L', 0, 1000);

      const aquiferBefore = resourceManager.getResourceById(regionId, 'res-water-1')!.currentAmount;
      const walletBefore = citizen.wallet!.balance;

      const success = consumptionEngine.consume(citizen, 'THIRST', 100);
      expect(success).toBe(true);

      // Bottled water was consumed: 2 units removed from inventory
      const inv = inventoryManager.getInventory(householdInventoryId)!;
      expect(inv.items['bottled_water'].availableQuantity).toBe(3);

      // Regional aquifer was NOT tapped
      const aquiferAfter = resourceManager.getResourceById(regionId, 'res-water-1')!.currentAmount;
      expect(aquiferAfter).toBe(aquiferBefore);

      // Citizen wallet was NOT charged tariff
      expect(citizen.wallet!.balance).toBe(walletBefore);

      // Ledger context should be default CITIZEN_NEED, not tap water
      const records = consumptionLedger.getRecords().filter(r => r.consumerId === citizen.id);
      expect(records.length).toBe(1);
      expect(records[0].commodityId).toBe('bottled_water');
      expect(records[0].sourceInventoryId).toBe(householdInventoryId);
    });
  });

  describe('6. Economic Billing and Tariff', () => {
    it('should bill citizen based on tariff and credit the utility wallet', () => {
      const tariff = 0.05; // 0.05 credits/L
      consumptionEngine.setWaterTariff(tariff);

      const utilityWallet = marketEngine.getOrCreateUtilityWallet(regionId);
      expect(utilityWallet.balance).toBe(0);

      const initialCitizenBalance = citizen.wallet!.balance; // 50 credits

      // Citizen needs 2 Litres (cost = 2 * 0.05 = 0.10 credits)
      const success = consumptionEngine.consume(citizen, 'THIRST', 100);
      expect(success).toBe(true);

      // Payer debited
      expect(citizen.wallet!.balance).toBe(Number((initialCitizenBalance - 0.10).toFixed(4)));
      expect(citizen.wallet!.totalExpenses).toBe(0.10);

      // Payee credited
      expect(utilityWallet.balance).toBe(0.10);
      expect(utilityWallet.totalIncome).toBe(0.10);

      // Transaction recorded in MarketEngine
      const txs = marketEngine.getTransactionsByEntity(citizen.id);
      expect(txs.length).toBe(1);
      expect(txs[0].transactionType).toBe(TransactionType.EXPENSE);
      expect(txs[0].buyerId).toBe(citizen.id);
      expect(txs[0].sellerId).toBe(utilityWallet.ownerId);
      expect(txs[0].quantity).toBe(2);
      expect(txs[0].unit).toBe('L');
      expect(txs[0].unitPrice).toBe(0.05);
      expect(txs[0].totalPrice).toBe(0.10);
    });
  });

  describe('7. Insufficient Funds and Compensating Strategy', () => {
    it('should reject transaction and not deduct water if citizen has insufficient funds', () => {
      citizen.wallet!.balance = 0.01; // Not enough for 0.10 credit water bill
      const initialAquiferM3 = resourceManager.getResourceById(regionId, 'res-water-1')!.currentAmount;

      const success = consumptionEngine.consume(citizen, 'THIRST', 100);
      expect(success).toBe(false);

      // Wallet not charged
      expect(citizen.wallet!.balance).toBe(0.01);

      // Regional water intact (never depleted)
      const aquiferM3 = resourceManager.getResourceById(regionId, 'res-water-1')!.currentAmount;
      expect(aquiferM3).toBe(initialAquiferM3);

      // Thirst not quenched
      expect(citizen.vitalState.thirst).toBe(70);
    });

    it('should refund extracted water via compensating rollback if marketEngine transaction fails', () => {
      // Mock marketEngine.processTransaction to simulate a downstream processing failure
      const initialAquiferM3 = resourceManager.getResourceById(regionId, 'res-water-1')!.currentAmount;
      jest.spyOn(marketEngine, 'processTransaction').mockReturnValue(null as any);

      const success = consumptionEngine.consume(citizen, 'THIRST', 100);
      expect(success).toBe(false);

      // Water was extracted and then immediately refunded via refundDomesticWater
      const finalAquiferM3 = resourceManager.getResourceById(regionId, 'res-water-1')!.currentAmount;
      expect(finalAquiferM3).toBe(initialAquiferM3);

      // Thirst remains 70
      expect(citizen.vitalState.thirst).toBe(70);
    });

    it('should refund water and reverse financial transaction if satisfyThirst throws an error', () => {
      const initialAquiferM3 = resourceManager.getResourceById(regionId, 'res-water-1')!.currentAmount;
      const initialCitizenBalance = citizen.wallet!.balance;
      const utilityWallet = marketEngine.getOrCreateUtilityWallet(regionId);
      const initialUtilityBalance = utilityWallet.balance;

      // Simulate unexpected error in satisfyThirst
      jest.spyOn(needsService, 'satisfyThirst').mockImplementationOnce(() => {
        throw new Error('Simulated satisfyThirst failure');
      });

      const success = consumptionEngine.consume(
        citizen,
        'THIRST',
        100,
        undefined,
        'evt-err-thirst',
        'RESIDENTIAL_WATER',
        regionId
      );
      expect(success).toBe(false);

      // 1. Water must be restored to aquifer
      expect(resourceManager.getResourceById(regionId, 'res-water-1')!.currentAmount).toBe(initialAquiferM3);

      // 2. Citizen wallet must be restored
      expect(citizen.wallet!.balance).toBe(initialCitizenBalance);
      expect(citizen.wallet!.totalExpenses).toBe(0);

      // 3. Utility wallet must be restored
      expect(utilityWallet.balance).toBe(initialUtilityBalance);
      expect(utilityWallet.totalIncome).toBe(0);

      // 4. Thirst must be unchanged
      expect(citizen.vitalState.thirst).toBe(70);

      // 5. No completed consumption record
      expect(consumptionLedger.getRecords().filter(r => r.eventId === 'evt-err-thirst').length).toBe(0);

      // 6. Traceable reversal transaction recorded
      const reversalTx = marketEngine.getTransaction('tx-tap-evt-err-thirst-reversal');
      expect(reversalTx).toBeDefined();
      expect(reversalTx!.referenceId).toBe('tx-tap-evt-err-thirst');
    });

    it('should revert thirst, refund water, and reverse financial transaction if consumptionLedger rejects record', () => {
      const initialAquiferM3 = resourceManager.getResourceById(regionId, 'res-water-1')!.currentAmount;
      const initialCitizenBalance = citizen.wallet!.balance;
      const utilityWallet = marketEngine.getOrCreateUtilityWallet(regionId);
      const initialUtilityBalance = utilityWallet.balance;

      // Simulate consumption ledger returning false
      jest.spyOn(consumptionLedger, 'record').mockReturnValueOnce(false);

      const success = consumptionEngine.consume(
        citizen,
        'THIRST',
        100,
        undefined,
        'evt-err-ledger',
        'RESIDENTIAL_WATER',
        regionId
      );
      expect(success).toBe(false);

      // Water refunded
      expect(resourceManager.getResourceById(regionId, 'res-water-1')!.currentAmount).toBe(initialAquiferM3);

      // Wallets restored
      expect(citizen.wallet!.balance).toBe(initialCitizenBalance);
      expect(utilityWallet.balance).toBe(initialUtilityBalance);

      // Thirst reverted back to original
      expect(citizen.vitalState.thirst).toBe(70);

      // Reversal transaction recorded
      expect(marketEngine.getTransaction('tx-tap-evt-err-ledger-reversal')).toBeDefined();
    });
  });

  describe('8. Duplicate Retries and Idempotency', () => {
    it('should not extract water or charge citizen twice on replayed eventId in same session', () => {
      const eventId = 'action-drink-uuid-001';

      const initialCitizenBalance = citizen.wallet!.balance;
      const initialAquiferM3 = resourceManager.getResourceById(regionId, 'res-water-1')!.currentAmount;

      // First call
      const firstResult = consumptionEngine.consume(citizen, 'THIRST', 100, undefined, eventId, 'RESIDENTIAL_WATER', regionId);
      expect(firstResult).toBe(true);

      const balanceAfterFirst = citizen.wallet!.balance;
      const aquiferAfterFirst = resourceManager.getResourceById(regionId, 'res-water-1')!.currentAmount;
      expect(balanceAfterFirst).toBeLessThan(initialCitizenBalance);
      expect(aquiferAfterFirst).toBeLessThan(initialAquiferM3);

      // Second call with same eventId (replay / retry)
      const secondResult = consumptionEngine.consume(citizen, 'THIRST', 100, undefined, eventId, 'RESIDENTIAL_WATER', regionId);
      expect(secondResult).toBe(true);

      // Balance and aquifer must be completely unchanged
      expect(citizen.wallet!.balance).toBe(balanceAfterFirst);
      expect(resourceManager.getResourceById(regionId, 'res-water-1')!.currentAmount).toBe(aquiferAfterFirst);

      // Ledger should contain only 1 record
      const records = consumptionLedger.getRecords().filter(r => r.consumerId === citizen.id);
      expect(records.length).toBe(1);
    });

    it('should prevent duplicate debit/credit when MarketEngine.processTransaction is called with same transactionId', () => {
      const utilityWallet = marketEngine.getOrCreateUtilityWallet(regionId);
      const initialCitizenBal = citizen.wallet!.balance;
      const initialUtilityBal = utilityWallet.balance;
      const txId = 'tx-direct-dup-001';

      // First transaction call
      const tx1 = marketEngine.processTransaction(
        citizen.id,
        utilityWallet.ownerId,
        'water',
        2,
        'L',
        0.05,
        0.10,
        'GEN',
        TransactionType.EXPENSE,
        regionId,
        txId
      );
      expect(tx1).toBeDefined();
      expect(citizen.wallet!.balance).toBe(Number((initialCitizenBal - 0.10).toFixed(4)));
      expect(utilityWallet.balance).toBe(Number((initialUtilityBal + 0.10).toFixed(4)));

      // Duplicate transaction call with same transactionId
      const tx2 = marketEngine.processTransaction(
        citizen.id,
        utilityWallet.ownerId,
        'water',
        2,
        'L',
        0.05,
        0.10,
        'GEN',
        TransactionType.EXPENSE,
        regionId,
        txId
      );
      expect(tx2).toBeDefined();
      expect(tx2!.transactionId).toBe(txId);

      // Wallets must not be debited or credited a second time
      expect(citizen.wallet!.balance).toBe(Number((initialCitizenBal - 0.10).toFixed(4)));
      expect(utilityWallet.balance).toBe(Number((initialUtilityBal + 0.10).toFixed(4)));

      // Transaction list must have exactly 1 record with this ID
      const matching = marketEngine.getTransactionsByEntity(citizen.id).filter(t => t.transactionId === txId);
      expect(matching.length).toBe(1);
    });

    it('should be idempotent on duplicate reverseTransaction calls', () => {
      const utilityWallet = marketEngine.getOrCreateUtilityWallet(regionId);
      const origTxId = 'tx-to-reverse-001';
      const revTxId = 'tx-to-reverse-001-reversal';

      const initialCitizenBal = citizen.wallet!.balance;

      marketEngine.processTransaction(
        citizen.id,
        utilityWallet.ownerId,
        'water',
        2,
        'L',
        0.05,
        0.10,
        'GEN',
        TransactionType.EXPENSE,
        regionId,
        origTxId
      );

      // First reversal
      const rev1 = marketEngine.reverseTransaction(origTxId, revTxId);
      expect(rev1).toBeDefined();
      expect(citizen.wallet!.balance).toBe(initialCitizenBal);
      expect(utilityWallet.balance).toBe(0);

      // Duplicate reversal call
      const rev2 = marketEngine.reverseTransaction(origTxId, revTxId);
      expect(rev2).toBeDefined();
      expect(rev2!.transactionId).toBe(revTxId);

      // Balances must not be altered again
      expect(citizen.wallet!.balance).toBe(initialCitizenBal);
      expect(utilityWallet.balance).toBe(0);
    });

    it('should detect persistent eventId via hydrated ConsumptionLedger and prevent duplicate execution across restart', () => {
      // Simulate cold restart: create a new ConsumptionEngine with clean processedEventIds,
      // but with a ConsumptionLedger pre-hydrated with 'evt-preloaded-restart-1'
      const freshLedger = new ConsumptionLedger();
      freshLedger.loadRecords([{
        eventId: 'evt-preloaded-restart-1',
        timestamp: 500,
        commodityId: 'water',
        quantity: 2,
        unit: 'L',
        context: 'RESIDENTIAL_WATER',
        regionId,
        consumerId: citizen.id,
        householdId
      }]);

      const commodities: Record<string, Commodity> = {
        water: {
          id: 'water',
          name: 'Water',
          category: ProductCategory.FOOD,
          unit: 'L',
          basePrice: 0.05,
          isBiological: true,
          consumable: { restorationNeed: 'THIRST', restorationValue: 25 }
        }
      };

      const freshEngine = new ConsumptionEngine(
        inventoryManager,
        needsService,
        (id: string) => commodities[id],
        freshLedger
      );
      freshEngine.setResourceConsumptionEngine(resourceConsumptionEngine);
      freshEngine.setMarketEngine(marketEngine);
      freshEngine.setWaterTariff(0.05);
      freshEngine.setWaterConnectionChecker(() => ({ connected: true, buildingId, regionId }));

      const aquiferBefore = resourceManager.getResourceById(regionId, 'res-water-1')!.currentAmount;
      const citizenBalBefore = citizen.wallet!.balance;
      const thirstBefore = citizen.vitalState.thirst;

      // Replay the persistent event ID
      const result = freshEngine.consume(
        citizen,
        'THIRST',
        100,
        undefined,
        'evt-preloaded-restart-1',
        'RESIDENTIAL_WATER',
        regionId
      );
      expect(result).toBe(true);

      // Assert no second water extraction, charge, or thirst restoration
      expect(resourceManager.getResourceById(regionId, 'res-water-1')!.currentAmount).toBe(aquiferBefore);
      expect(citizen.wallet!.balance).toBe(citizenBalBefore);
      expect(citizen.vitalState.thirst).toBe(thirstBefore);
    });
  });

  describe('9. CandidateGenerator and Dehydration Behavior', () => {
    it('should generate CONSUME_WATER action and avoid retail or river actions when tap water is connected', () => {
      const need = {
        needType: 'THIRST',
        urgency: 85,
        level: NeedUrgencyLevel.CRITICAL
      } as any;

      const context: DecisionContext = {
        citizenId: citizen.id,
        age: 30,
        vitalState: citizen.vitalState,
        skills: [],
        employmentStatus: citizen.employmentStatus,
        workplaceId: null,
        currentLocationId: buildingId,
        currentDestinationId: null,
        simulationTime: new Date(),
        perception: {
          nearbyResources: [{ id: 'res-river-1', type: 'WATER' }]
        } as any,
        stockLevels: { water: 0 },
        hasWaterConnection: true
      };

      const candidates: any[] = [];
      (candidateGenerator as any).generateThirstCandidates(need, context, candidates);

      // Must generate CONSUME_WATER for tap water
      const consumeWater = candidates.find(c => c.type === ActionType.CONSUME_WATER);
      expect(consumeWater).toBeDefined();
      expect(consumeWater.reason).toContain('residential tap water is available');

      // Must NOT generate emergency retail purchase or GO_TO_WATER_SOURCE
      const purchaseAction = candidates.find(c => c.type === ActionType.PURCHASE);
      const riverAction = candidates.find(c => c.type === ActionType.GO_TO_WATER_SOURCE);
      expect(purchaseAction).toBeUndefined();
      expect(riverAction).toBeUndefined();
    });

    it('should generate emergency PURCHASE and GO_TO_WATER_SOURCE when tap water is NOT connected and inventory is empty', () => {
      const need = {
        needType: 'THIRST',
        urgency: 85,
        level: NeedUrgencyLevel.CRITICAL
      } as any;

      const context: DecisionContext = {
        citizenId: citizen.id,
        age: 30,
        vitalState: citizen.vitalState,
        skills: [],
        employmentStatus: citizen.employmentStatus,
        workplaceId: null,
        currentLocationId: buildingId,
        currentDestinationId: null,
        simulationTime: new Date(),
        perception: {
          nearbyResources: [{ id: 'res-river-1', type: 'WATER' }]
        } as any,
        stockLevels: { water: 0 },
        hasWaterConnection: false // No tap water!
      };

      const candidates: any[] = [];
      (candidateGenerator as any).generateThirstCandidates(need, context, candidates);

      // Must generate emergency retail PURCHASE action
      const purchaseAction = candidates.find(c => c.type === ActionType.PURCHASE);
      expect(purchaseAction).toBeDefined();
      expect(purchaseAction.reason).toContain('EMERGENCY: Thirst is CRITICAL and no water in stock');

      // Must generate GO_TO_WATER_SOURCE to drink from river
      const riverAction = candidates.find(c => c.type === ActionType.GO_TO_WATER_SOURCE);
      expect(riverAction).toBeDefined();
    });
  });
});
