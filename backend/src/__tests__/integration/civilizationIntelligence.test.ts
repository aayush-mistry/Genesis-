import { FastifyInstance } from 'fastify';
import { prisma } from '../../repositories/prisma';
import { buildApp } from '../../app';
import request from 'supertest';

describe('Civilization Intelligence (T7.6)', () => {
  let app: FastifyInstance;
  let serverInstance: any;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
    serverInstance = app.server;
    
    // Cleanup
    await prisma.transactionRecord.deleteMany();
    await prisma.inventoryItem.deleteMany();
    await prisma.inventory.deleteMany();
    await prisma.order.deleteMany();
    await prisma.shipment.deleteMany();
    await prisma.workplace.deleteMany();
    await prisma.citizen.deleteMany();
    await prisma.wallet.deleteMany();
  });

  afterAll(async () => {
    await prisma.transactionRecord.deleteMany();
    await prisma.inventoryItem.deleteMany();
    await prisma.inventory.deleteMany();
    await prisma.order.deleteMany();
    await prisma.shipment.deleteMany();
    await prisma.workplace.deleteMany();
    await prisma.citizen.deleteMany();
    await prisma.wallet.deleteMany();
    if (app) await app.close();
  });

  it('should return initial zero/empty civilization metrics', async () => {
    const response = await request(serverInstance).get('/api/v1/world/summary');
    expect(response.status).toBe(200);
    const summary = response.body;

    expect(summary.population.total).toBe(0);
    expect(summary.employment.workforce).toBe(0);
    expect(summary.finance.totalMoney).toBe(0);
    expect(summary.resources.food.quantity).toBe(0);
  });

  it('should accurately aggregate inserted real data', async () => {
    // 1. Insert Region
    const region = await prisma.region.create({
      data: {
        name: 'Test Region', description: 'desc', climate: 'TEMPERATE', coordX: 0, coordY: 0,
        world: {
          create: {
            name: 'Test World', description: 'desc', randomSeed: 1, creationTime: 0,
            worldSize: 1000, climateProfile: 'TEMPERATE', timeZone: 'UTC', version: '1.0', status: 'ACTIVE'
          }
        }
      }
    });

    // 2. Insert Citizen
    await prisma.citizen.create({
      data: {
        name: 'Test Citizen', gender: 'MALE', status: 'ACTIVE',
        birthDateJson: '{}', createdAtSimJson: '{}',
        vitalStateJson: '{}', personalityJson: '{}', skillsJson: '{}',
        employmentStatus: 'EMPLOYED', movementState: 'WORKING'
      }
    });

    // 3. Insert Inventory & Items
    const inv = await prisma.inventory.create({
      data: { ownerId: 'test-owner', storageCapacity: 1000 }
    });

    await prisma.inventoryItem.create({
      data: {
        inventoryId: inv.id,
        productId: 'wheat',
        totalQuantity: 1500,
        unit: 'kg'
      }
    });
    
    // 4. Insert Workplace (Producer)
    await prisma.workplace.create({
      data: {
        type: 'FARM',
        locationId: 'loc1',
        regionId: region.id,
        capacity: 10,
        occupiedPositions: 5
      }
    });
    
    // 5. Insert Wallet
    await prisma.wallet.create({
      data: {
        ownerId: 'some-wallet-owner',
        balance: 500,
        currency: 'GEN'
      }
    });

    // Call API
    const response = await request(serverInstance).get('/api/v1/world/summary');
    expect(response.status).toBe(200);
    const summary = response.body;

    // Verify Population
    expect(summary.population.total).toBe(1);
    expect(summary.employment.workforce).toBe(1);
    
    // Verify Resources
    expect(summary.resources.food.quantity).toBe(1500);

    // Verify Economy/Production
    expect(summary.production.activeProducers).toBe(1);
  });
});
