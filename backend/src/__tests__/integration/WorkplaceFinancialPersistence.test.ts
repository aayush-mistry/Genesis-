import { prisma } from '../../repositories/prisma';
import { worldService } from '../../services/world.service';
import { supplyService } from '../../services/supply.service';
import { marketService } from '../../services/market.service';
import { financeService } from '../../services/finance.service';
import { persistenceService } from '../../services/persistence.service';
import { workplaceRepository } from '../../repositories/WorkplaceRepository';
import { WorkplaceType, TransactionType } from '@genesis/shared';
import { EventRegistry } from '@genesis/engine';

describe('Workplace Financial Persistence (T8.6.2 / GAP-4)', () => {
  const worldId = 'test-world-financial-sync';
  const regionId = 'test-reg-financial-sync';

  const farmId = 'wp-farm-finance-test';
  const shopId = 'wp-shop-finance-test';
  const factoryId = 'wp-factory-finance-test';

  beforeAll(async () => {
    // Clean tables
    await prisma.transactionRecord.deleteMany();
    await prisma.wallet.deleteMany();
    await prisma.jobPosition.deleteMany();
    await prisma.workplace.deleteMany();
    await prisma.region.deleteMany();
    await prisma.world.deleteMany();

    await prisma.world.create({
      data: {
        id: worldId,
        name: 'Financial Sync Test World',
        description: 'A test world for financial sync',
        randomSeed: 12345,
        creationTime: 1,
        worldSize: 1000,
        width: 1000,
        height: 1000,
        climateProfile: 'TEMPERATE',
        timeZone: 'UTC',
        version: '1.0.0',
        status: 'ACTIVE'
      }
    });

    await prisma.region.create({
      data: {
        id: regionId,
        worldId: worldId,
        name: 'Financial Sync Test Region',
        description: 'Region for testing financial sync',
        climate: 'TEMPERATE',
        coordX: 0,
        coordY: 0,
        width: 1000,
        height: 1000
      }
    });

    // Create database workplace records
    await prisma.workplace.createMany({
      data: [
        {
          id: farmId,
          regionId,
          type: WorkplaceType.FARM,
          locationId: 'loc-farm',
          capacity: 10,
          occupiedPositions: 0,
          vacancies: 10,
          revenue: 0,
          expenses: 0,
          profit: 0
        },
        {
          id: shopId,
          regionId,
          type: WorkplaceType.SHOP,
          locationId: 'loc-shop',
          capacity: 10,
          occupiedPositions: 0,
          vacancies: 10,
          revenue: 0,
          expenses: 0,
          profit: 0
        },
        {
          id: factoryId,
          regionId,
          type: WorkplaceType.FACTORY,
          locationId: 'loc-factory',
          capacity: 20,
          occupiedPositions: 0,
          vacancies: 20,
          revenue: 0,
          expenses: 0,
          profit: 0
        }
      ]
    });
  });

  afterAll(async () => {
    await prisma.transactionRecord.deleteMany();
    await prisma.wallet.deleteMany();
    await prisma.jobPosition.deleteMany();
    await prisma.workplace.deleteMany();
    await prisma.region.deleteMany();
    await prisma.world.deleteMany();
    await prisma.$disconnect();
    EventRegistry.clear();
  });

  beforeEach(() => {
    // Reset in-memory world and supply state
    worldService.engine.reset();
    marketService.initialize();
    financeService.initialize();
    supplyService.reset();

    // Re-register in-memory workplaces matching DB
    registerInMemoryWorkplace(farmId, WorkplaceType.FARM, 'loc-farm', 10);
    registerInMemoryWorkplace(shopId, WorkplaceType.SHOP, 'loc-shop', 10);
    registerInMemoryWorkplace(factoryId, WorkplaceType.FACTORY, 'loc-factory', 20);
  });

  it('1 & 2. Workplace revenue and expenses are synchronized and profit follows established accounting convention', async () => {
    const shop = worldService.engine.workplaceRepository.findById(shopId)!;
    const farm = worldService.engine.workplaceRepository.findById(farmId)!;

    // Simulate business revenue and expenses
    shop.revenue = 15000;
    shop.expenses = 4500;
    shop.profit = shop.revenue - shop.expenses; // 10500 profit

    farm.revenue = 8000;
    farm.expenses = 9200;
    farm.profit = farm.revenue - farm.expenses; // -1200 loss

    // Execute tick-boundary persistence
    await persistenceService.persistTickBoundary();

    // Verify database records
    const dbShop = await workplaceRepository.getWorkplace(shopId);
    expect(dbShop).toBeDefined();
    expect(dbShop!.revenue).toBe(15000);
    expect(dbShop!.expenses).toBe(4500);
    expect(dbShop!.profit).toBe(10500);

    const dbFarm = await workplaceRepository.getWorkplace(farmId);
    expect(dbFarm).toBeDefined();
    expect(dbFarm!.revenue).toBe(8000);
    expect(dbFarm!.expenses).toBe(9200);
    expect(dbFarm!.profit).toBe(-1200);
  });

  it('3. Multiple workplaces are handled concurrently without cross-contamination', async () => {
    const factory = worldService.engine.workplaceRepository.findById(factoryId)!;
    expect(factory.revenue).toBe(0);
    expect(factory.expenses).toBe(0);
    expect(factory.profit).toBe(0);

    await persistenceService.persistTickBoundary();

    const dbFactory = await workplaceRepository.getWorkplace(factoryId);
    expect(dbFactory).toBeDefined();
    expect(dbFactory!.revenue).toBe(0);
    expect(dbFactory!.expenses).toBe(0);
    expect(dbFactory!.profit).toBe(0);
  });

  it('4. Repeated tick-boundary persistence is idempotent and does not mutate or duplicate activity', async () => {
    const shop = worldService.engine.workplaceRepository.findById(shopId)!;
    shop.revenue = 25000;
    shop.expenses = 10000;
    shop.profit = 15000;

    // Persist tick 1
    await persistenceService.persistTickBoundary();
    const dbAfterTick1 = await workplaceRepository.getWorkplace(shopId);
    expect(dbAfterTick1!.revenue).toBe(25000);
    expect(dbAfterTick1!.expenses).toBe(10000);
    expect(dbAfterTick1!.profit).toBe(15000);

    // Persist tick 2 and tick 3 without new activity
    await persistenceService.persistTickBoundary();
    await persistenceService.persistTickBoundary();

    const dbAfterTick3 = await workplaceRepository.getWorkplace(shopId);
    expect(dbAfterTick3!.revenue).toBe(25000);
    expect(dbAfterTick3!.expenses).toBe(10000);
    expect(dbAfterTick3!.profit).toBe(15000);
  });

  it('5. Persisted financial values survive cold-restart hydration', async () => {
    // 1. Seed authoritative values in database
    await workplaceRepository.updateFinancials(shopId, 42000, 18000, 24000);

    // 2. Clear memory to simulate shutdown
    worldService.engine.workplaceRepository.clear();
    expect(worldService.engine.workplaceRepository.findById(shopId)).toBeUndefined();

    // 3. Load workplaces from repository (simulating bootstrap step 3)
    const loadedWorkplaces = await workplaceRepository.listWorkplaces();
    for (const wp of loadedWorkplaces) {
      worldService.engine.workplaceRepository.create({
        id: wp.id,
        type: wp.type as WorkplaceType,
        locationId: wp.locationId,
        regionId: wp.regionId,
        capacity: wp.capacity,
        occupiedPositions: wp.occupiedPositions,
        vacancies: wp.vacancies,
        revenue: wp.revenue,
        expenses: wp.expenses,
        profit: wp.profit,
        positions: []
      });
    }

    // 4. Verify in-memory state is restored accurately
    const restoredShop = worldService.engine.workplaceRepository.findById(shopId);
    expect(restoredShop).toBeDefined();
    expect(restoredShop!.revenue).toBe(42000);
    expect(restoredShop!.expenses).toBe(18000);
    expect(restoredShop!.profit).toBe(24000);
  });

  it('6. B2B transaction and payroll activity seamlessly flow to workplace financial persistence', async () => {
    const shop = worldService.engine.workplaceRepository.findById(shopId)!;
    const farm = worldService.engine.workplaceRepository.findById(farmId)!;

    shop.wallet = {
      id: `wallet-${shopId}`,
      ownerId: shopId,
      balance: 100000,
      currency: 'GEN',
      totalIncome: 0,
      totalExpenses: 0
    };

    farm.wallet = {
      id: `wallet-${farmId}`,
      ownerId: farmId,
      balance: 5000,
      currency: 'GEN',
      totalIncome: 0,
      totalExpenses: 0
    };

    // Execute a B2B wholesale transaction: Shop buys from Farm for 3,500 GEN
    const tx = marketService.engine.processTransaction(
      shopId,
      farmId,
      'wheat',
      350,
      'kg',
      10,
      3500,
      'GEN',
      TransactionType.WHOLESALE_PURCHASE,
      regionId
    );
    expect(tx).toBeDefined();

    // FinancialEngine's TransactionCompleted listener automatically updates accounting
    expect(farm.revenue).toBe(3500);
    expect(shop.expenses).toBe(3500);
    expect(farm.profit).toBe(3500);
    expect(shop.profit).toBe(-3500);

    // Persist tick boundary
    await persistenceService.persistTickBoundary();

    // Verify database reflects the transaction-driven financial state
    const dbFarm = await workplaceRepository.getWorkplace(farmId);
    expect(dbFarm!.revenue).toBe(3500);
    expect(dbFarm!.profit).toBe(3500);

    const dbShop = await workplaceRepository.getWorkplace(shopId);
    expect(dbShop!.expenses).toBe(3500);
    expect(dbShop!.profit).toBe(-3500);
  });

  function registerInMemoryWorkplace(
    id: string,
    type: WorkplaceType,
    locationId: string,
    capacity: number
  ) {
    worldService.engine.workplaceRepository.create({
      id,
      type,
      locationId,
      regionId,
      capacity,
      occupiedPositions: 0,
      vacancies: capacity,
      positions: [],
      revenue: 0,
      expenses: 0,
      profit: 0
    });
  }
});
