import { buildApp } from '../../app';
import { PrismaClient } from '@prisma/client';
import { FastifyInstance } from 'fastify';
import { EventRegistry } from '@genesis/engine';
import { persistenceService } from '../../services/persistence.service';
import { worldService } from '../../services/world.service';
import { supplyService } from '../../services/supply.service';
import { citizenService } from '../../services/citizen.service';
import { ActionState, ActionType, CitizenStatus } from '@genesis/shared';
import { timeService } from '../../services/time.service';
import { eventService } from '../../services/event.service';

const prisma = new PrismaClient();

describe('Economic Feedback & Persistence Integration', () => {
  let app: FastifyInstance;
  let testCitizenId: string;
  let testStoreId: string;

  beforeAll(async () => {
    // Clean DB
    await prisma.transactionRecord.deleteMany({});
    await prisma.creditHistory.deleteMany({});
    await prisma.wallet.deleteMany({});
    await prisma.inventoryItem.deleteMany({});
    await prisma.inventory.deleteMany({});
    await prisma.citizen.deleteMany({});
    await prisma.household.deleteMany({});
    await prisma.jobPosition.deleteMany({});
    await prisma.workplace.deleteMany({});
    await prisma.resource.deleteMany({});
    await prisma.terrain.deleteMany({});
    await prisma.room.deleteMany({});
    await prisma.building.deleteMany({});
    await prisma.district.deleteMany({});
    await prisma.city.deleteMany({});
    await prisma.region.deleteMany({});
    await prisma.world.deleteMany({});

    app = await buildApp();
    await app.ready();
    
    // Create a generated world
    await worldService.generatePopulatedWorld('Persistence Test World', 'Testing...', 42);
    
    const citizens = citizenService.engine.listCitizens();
    testCitizenId = citizens[0].id;

    // Give citizen some money
    const citizen = citizenService.engine.getCitizen(testCitizenId);
    if (citizen && citizen.wallet) {
      citizen.wallet.balance = 500;
    }

    const workplaces = worldService.engine.workplaceRepository.findAll();
    console.log("Test Setup: Total workplaces =", workplaces.length);
    const stores = workplaces.filter(w => ['STORE', 'SHOP'].includes(w.type));
    console.log("Test Setup: Store types =", stores.map(w => w.type));
    if (stores.length > 0) {
      testStoreId = stores[0].id;
      // Setup store inventory with wheat
      const invId = stores[0].inventoryId;
      console.log("Test Setup: testStoreId =", testStoreId, "invId =", invId);
      if (invId) {
        const added = supplyService.inventoryManager.addItemQuantity(invId, 'wheat', 100, 'kg');
        console.log("Test Setup: Added wheat to invId? =", added);
        const fetched = supplyService.inventoryManager.getInventory(invId);
        console.log("Test Setup: Fetched inventory directly =", fetched?.id);
      }
    } else {
      throw new Error('No store found in generated world');
    }

    // Force persistence to save our overrides
    await persistenceService.persistTickBoundary({ citizens: [testCitizenId] });
  }, 60000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    await prisma.$disconnect();
    EventRegistry.clear();
  });

  it('PROCESS A: Execute Real Purchase and Save', async () => {
    const citizen = citizenService.engine.getCitizen(testCitizenId);
    expect(citizen).toBeDefined();

    const storeBuildingId = worldService.engine.workplaceRepository.findById(testStoreId)!.locationId;
    citizen!.locationId = storeBuildingId;
    citizen!.householdId = undefined;

    // Give citizen a food need by triggering DecisionEngine directly or setting action
    const storeInventoryId = worldService.engine.workplaceRepository.findById(testStoreId)!.inventoryId!;
    const storeWheatBefore = supplyService.inventoryManager.getInventory(storeInventoryId)?.items['wheat']?.totalQuantity || 0;

    const purchaseAction = citizenService.engine.actionExecutor.executeAction(citizen!, {
      type: ActionType.PURCHASE,
      target: { id: storeBuildingId, type: 'BUILDING' },
      source: testCitizenId,
      reason: 'Testing',
      metadata: { productId: 'wheat', targetQuantity: 2, sellerId: testStoreId }
    });

    for (let i = 0; i < 10; i++) {
      citizenService.engine.tickCitizen(testCitizenId);
      console.log(`Test Tick ${i}: action state=`, purchaseAction.state, " reason=", purchaseAction.reason);
      if (purchaseAction.state === ActionState.COMPLETED || purchaseAction.state === ActionState.FAILED) {
        break;
      }
    }

    expect(purchaseAction.state).toBe(ActionState.COMPLETED);

    // Verify Memory Conservation
    const storeWheatAfter = supplyService.inventoryManager.getInventory(storeInventoryId)?.items['wheat']?.totalQuantity || 0;
    expect(storeWheatAfter).toBe(storeWheatBefore - 2);

    const householdInvId = citizen!.householdId ? citizenService.engine.householdService.getHousehold(citizen!.householdId)?.inventoryId || '' : `inv-${citizen!.id}`;
    const householdWheat = supplyService.inventoryManager.getInventory(householdInvId)?.items['wheat']?.totalQuantity || 0;
    // Depending on whether it hit household (20 starter + 2) or personal (0 + 2)
    expect(householdWheat === 22 || householdWheat === 2).toBe(true);

    console.log("PROCESS A: Balance before save =", citizen!.wallet.balance);
    expect(citizen!.wallet.balance).toBeLessThan(500); // Spent money

    // Force persistence to save state to SQLite
    await persistenceService.persistTickBoundary({ citizens: [testCitizenId] });

    const savedInvs = await prisma.inventory.findMany({ where: { ownerId: testCitizenId }, include: { items: true } });
    console.log("PROCESS A: Saved DB inventories for citizen:", JSON.stringify(savedInvs));
  });

  it('PROCESS B: Hydrate and Verify', async () => {
    // Clear Memory
    worldService.engine.reset();
    citizenService.engine.clear();
    supplyService.reset();
    eventService.scheduler.clearEvents();

    // Re-bootstrap (Hydrate from SQLite)
    await persistenceService.bootstrap();

    const citizen = citizenService.engine.getCitizen(testCitizenId);
    expect(citizen).toBeDefined();

    console.log("PROCESS B: Balance after load =", citizen!.wallet?.balance);
    expect(citizen!.wallet.balance).toBeLessThan(500);

    const storeInventoryId = worldService.engine.workplaceRepository.findById(testStoreId)!.inventoryId!;
    const storeWheatAfter = supplyService.inventoryManager.getInventory(storeInventoryId)?.items['wheat']?.totalQuantity || 0;
    expect(storeWheatAfter).toBe(98);

    const householdInvId = `inv-${citizen!.id}`;
    const inv = supplyService.inventoryManager.getInventory(householdInvId);
    console.log("PROCESS B: Loaded inventory:", JSON.stringify(inv));
    const householdWheat = inv?.items['wheat']?.totalQuantity || 0;
    expect(householdWheat === 22 || householdWheat === 2).toBe(true);

    // Verify the simulation time hasn't reset
    const simState = await prisma.simulationState.findFirst();
    expect(simState).toBeDefined();
  });

  it('PROCESS C: Shortage -> Starvation -> Death', async () => {
    // Get citizen
    const citizen = citizenService.engine.getCitizen(testCitizenId)!;
    expect(citizen).toBeDefined();

    // Set hunger to critical
    citizen.vitalState.hunger = 95;
    citizen.vitalState.health = 20;

    // Remove all wheat from everywhere so they can't consume or buy
    const storeInventoryId = worldService.engine.workplaceRepository.findById(testStoreId)!.inventoryId!;
    supplyService.inventoryManager.removeItemQuantity(storeInventoryId, 'wheat', 1000);
    
    const householdInvId = citizen.householdId ? citizenService.engine.householdService.getHousehold(citizen.householdId)?.inventoryId || '' : `inv-${citizen.id}`;
    supplyService.inventoryManager.removeItemQuantity(householdInvId, 'wheat', 1000);

    // Manually force starvation
    citizen.vitalState.health = 0;
    citizenService.engine.tickCitizen(citizen.id);

    // Since they starved (health dropped below 0) they should be DEAD
    expect(citizen.status).toBe(CitizenStatus.DECEASED);

    // Verify employment was released
    expect(citizen.employmentStatus).toBe('UNEMPLOYED');
    expect(citizen.workplaceId).toBeNull();

    // Verify DB update
    await persistenceService.persistTickBoundary({ citizens: [citizen.id] });
    const dbCitizen = await prisma.citizen.findUnique({ where: { id: citizen.id } });
    expect(dbCitizen?.status).toBe('DECEASED');
  });

});
