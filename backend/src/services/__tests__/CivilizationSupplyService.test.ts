import { prisma } from '../../repositories/prisma';
import { worldService } from '../world.service';
import { timeService } from '../time.service';
import { supplyService } from '../supply.service';
import { civilizationSupplyService } from '../civilizationSupply.service';
import { TimeUtils } from '@genesis/engine';

describe('CivilizationSupplyService', () => {
  let testWorldId: string;
  let testRegionId: string;

  beforeAll(async () => {
    supplyService.initialize();
    
    // Clear before run
    await prisma.transactionRecord.deleteMany();
    await prisma.inventoryItem.deleteMany();
    await prisma.inventory.deleteMany();
    await prisma.shipment.deleteMany();
    await prisma.order.deleteMany();
    await prisma.workplace.deleteMany();
    await prisma.region.deleteMany();
    await prisma.world.deleteMany();

    const world = await prisma.world.create({
      data: {
        id: 'supply-world',
        name: 'Supply Test World',
        description: 'Test',
        randomSeed: 123,
        creationTime: 0,
        worldSize: 1,
        width: 1000,
        height: 1000,
        climateProfile: 'TEMPERATE',
        timeZone: 'UTC',
        version: '1.0',
        status: 'ACTIVE'
      }
    });
    testWorldId = world.id;

    const region = await prisma.region.create({
      data: {
        id: 'supply-region',
        name: 'Supply Region',
        description: 'Test Region',
        climate: 'TEMPERATE',
        coordX: 0,
        coordY: 0,
        width: 1000,
        height: 1000,
        worldId: testWorldId
      }
    });
    testRegionId = region.id;
  });

  afterAll(async () => {
    await prisma.transactionRecord.deleteMany();
    await prisma.inventoryItem.deleteMany();
    await prisma.inventory.deleteMany();
    await prisma.shipment.deleteMany();
    await prisma.order.deleteMany();
    await prisma.workplace.deleteMany();
    await prisma.region.deleteMany();
    await prisma.world.deleteMany();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.inventoryItem.deleteMany();
    await prisma.inventory.deleteMany();
    await prisma.shipment.deleteMany();
    await prisma.order.deleteMany();
    await prisma.workplace.deleteMany();
  });

  it('Test 1 — Supply Aggregation: Correctly sums retail, wholesale, producer and transit', async () => {
    // Retail
    await prisma.inventory.create({
      data: {
        id: 'inv-shop', ownerId: 'shop-1', storageCapacity: 1000,
        items: {
          create: [{ productId: 'wheat', totalQuantity: 100, unit: 'kg' }]
        }
      }
    });
    await prisma.workplace.create({
      data: { id: 'shop-1', type: 'SHOP', locationId: 'loc-1', regionId: testRegionId, capacity: 10, occupiedPositions: 5 }
    });

    // Wholesale
    await prisma.inventory.create({
      data: {
        id: 'inv-wholesale', ownerId: 'wholesale-1', storageCapacity: 5000,
        items: {
          create: [{ productId: 'wheat', totalQuantity: 500, unit: 'kg' }]
        }
      }
    });
    await prisma.workplace.create({
      data: { id: 'wholesale-1', type: 'WHOLESALE', locationId: 'loc-2', regionId: testRegionId, capacity: 50, occupiedPositions: 50 }
    });

    // Producer
    await prisma.inventory.create({
      data: {
        id: 'inv-farm', ownerId: 'farm-1', storageCapacity: 10000,
        items: {
          create: [{ productId: 'wheat', totalQuantity: 1000, unit: 'kg' }]
        }
      }
    });
    await prisma.workplace.create({
      data: { id: 'farm-1', type: 'FARM', locationId: 'loc-3', regionId: testRegionId, capacity: 100, occupiedPositions: 100 }
    });

    // In Transit
    await prisma.shipment.create({
      data: {
        shipmentId: 'ship-1', originId: 'wholesale-1', destinationId: 'shop-1',
        productId: 'wheat', quantity: 200, unit: 'kg', transportationMode: 'ROAD',
        status: 'IN_TRANSIT'
      }
    });

    const supply = await civilizationSupplyService.getSupplyIntelligence();
    
    expect(supply.food.retailSupply).toBe(100);
    expect(supply.food.wholesaleSupply).toBe(500);
    expect(supply.food.producerSupply).toBe(1000);
    expect(supply.food.inTransitSupply).toBe(200);
    expect(supply.food.totalAvailable).toBe(1800);
    
    // Production capacity of Farm: Base yield = 100, workersRequired = 1, capacity = 100.
    // So 100/1 * 100 = 10000 max capacity. workerEfficiency = 1.0. -> 10000
    expect(supply.food.productionCapacity).toBeGreaterThan(0);
  });

  it('Test 2 — Shortage Scenario: Supply drops, order is placed, shipment dispatched', async () => {
    // We will use existing BusinessProcurementEngine to respond to shortage
    const { supplyService } = await import('../supply.service');
    const { timeService } = await import('../time.service');
    
    // 1. Create a shop with low inventory (below reorderPoint)
    await prisma.inventory.create({
      data: {
        id: 'inv-test-shop-2', ownerId: 'shop-2', storageCapacity: 1000,
        items: {
          create: [{ productId: 'wheat', totalQuantity: 10, unit: 'kg' }] // Below 50
        }
      }
    });

    const shop = await prisma.workplace.create({
      data: { 
        id: 'shop-2', type: 'SHOP', locationId: 'loc-1', regionId: testRegionId, 
        capacity: 100, occupiedPositions: 10,
        inventoryId: 'inv-test-shop-2',
        storageCapacity: 1000,
        inventoryConfigJson: JSON.stringify({
          'wheat': { reorderPoint: 50, targetStock: 200 }
        })
      }
    });

    supplyService.inventoryManager.createInventory('inv-test-shop-2', 'shop-2', 1000);
    supplyService.inventoryManager.addItemQuantity('inv-test-shop-2', 'wheat', 10, 'kg');

    // 2. Create a Wholesale supplier with plenty of stock
    await prisma.inventory.create({
      data: {
        id: 'inv-test-wholesale-2', ownerId: 'wholesale-2', storageCapacity: 5000,
        items: {
          create: [{ productId: 'wheat', totalQuantity: 1000, unit: 'kg' }]
        }
      }
    });

    const wholesale = await prisma.workplace.create({
      data: { 
        id: 'wholesale-2', type: 'WHOLESALE', locationId: 'loc-2', regionId: testRegionId, 
        capacity: 100, occupiedPositions: 10,
        inventoryId: 'inv-test-wholesale-2',
        storageCapacity: 5000
      }
    });

    supplyService.inventoryManager.createInventory('inv-test-wholesale-2', 'wholesale-2', 5000);
    supplyService.inventoryManager.addItemQuantity('inv-test-wholesale-2', 'wheat', 1000, 'kg');

    // We must manually add wallet to shop so it can afford the wholesale purchase
    shop.walletId = 'wallet-shop-2';
    wholesale.walletId = 'wallet-wholesale-2';
    
    // We update in prisma
    await prisma.workplace.update({ where: { id: 'shop-2' }, data: { walletId: 'wallet-shop-2' } });
    
    // Initialize in-memory repository (since SupplyChainEngine reads from it)
    (worldService.engine.workplaceRepository as any).workplaces.set(shop.id, {
      ...shop,
      inventoryConfiguration: { 'wheat': { reorderPoint: 50, targetStock: 200 } },
      wallet: { id: 'wallet-shop-2', ownerId: shop.id, balance: 10000, currency: 'CREDIT', totalIncome: 0, totalExpenses: 0 }
    } as any);

    (worldService.engine.workplaceRepository as any).workplaces.set(wholesale.id, {
      ...wholesale,
      wallet: { id: 'wallet-wholesale-2', ownerId: wholesale.id, balance: 10000, currency: 'CREDIT', totalIncome: 0, totalExpenses: 0 }
    } as any);
    
    // Mock Spatial coordinates
    const { spatialService } = await import('../spatial.service');
    spatialService.engine.queryService.calculateRoute = jest.fn().mockReturnValue({ distance: 10, path: [] });

    // Trigger procurement manually (this happens daily usually)
    supplyService.businessProcurementEngine.runProcurementCycle();

    // 3. Verify that an order was created and shipment is in transit
    const orders = supplyService.supplyChainEngine.getOrdersForBusiness(shop.id);
    expect(orders.length).toBeGreaterThan(0);
    const order = orders[0];
    
    expect(order.status).toBe('DISPATCHED');
    expect(order.shipmentId).toBeDefined();

    // 4. Verify wholesale inventory reserved/consumed correctly (Total physically left should be 1000 - ordered)
    // Wait, the inventory manager might be in-memory for this test?
    // Let's check inventory in DB
    const wholesaleInvDb = await prisma.inventoryItem.findFirst({
      where: { inventory: { ownerId: 'wholesale-2' }, productId: 'wheat' }
    });
    // However, InventoryManager in tests might write to DB or just memory.
    // In genesis, InventoryManager usually writes to DB immediately (wait, does it?)
    // Let's check supplyService.inventoryManager.
    const invMem = supplyService.inventoryManager.getInventory('inv-test-wholesale-2');
    expect(invMem?.items['wheat'].totalQuantity).toBeLessThan(1000);
    
    // 5. Verify the shipment arrived (we fast-forward time or trigger manually)
    if (order.shipmentId) {
      supplyService.supplyChainEngine['handleShipmentArrival']({ shipmentId: order.shipmentId, orderId: order.orderId });
    }

    // 6. Verify shop received the stock
    const shopInvMem = supplyService.inventoryManager.getInventory('inv-test-shop-2');
    expect(shopInvMem?.items['wheat'].totalQuantity).toBeGreaterThan(10);
  });
});
