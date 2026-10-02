import { FastifyInstance } from 'fastify';
import { prisma } from '../../repositories/prisma';
import { buildApp } from '../../app';

describe('World Summary API', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
    
    // Clean up relevant test data
    await prisma.inventoryItem.deleteMany();
    await prisma.inventory.deleteMany();
    await prisma.citizen.deleteMany();
    await prisma.world.deleteMany();
  }, 60000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.inventoryItem.deleteMany();
    await prisma.inventory.deleteMany();
    await prisma.citizen.deleteMany();
  });

  it('should return valid zero values when no data exists', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/world/summary'
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    
    expect(body.population).toBe(0);
    expect(body.employment.workforce).toBe(0);
    expect(body.employment.employed).toBe(0);
    expect(body.employment.unemployed).toBe(0);
    expect(body.employment.inactive).toBe(0);
    expect(body.resources.food.quantity).toBe(0);
    expect(body.resources.water.quantity).toBe(0);
  });

  it('should aggregate food and water accurately with explicit units without double-counting', async () => {
    const inv = await prisma.inventory.create({
      data: {
        ownerId: 'test-owner',
        storageCapacity: 1000
      }
    });

    await prisma.inventoryItem.createMany({
      data: [
        { inventoryId: inv.id, productId: 'wheat', totalQuantity: 100, unit: 'kg' },
        { inventoryId: inv.id, productId: 'raw_fish', totalQuantity: 50, unit: 'kg' },
        { inventoryId: inv.id, productId: 'water', totalQuantity: 200, unit: 'L' }
      ]
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/world/summary'
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    
    expect(body.resources.food.quantity).toBe(150); // 100 wheat + 50 raw_fish
    expect(body.resources.food.unit).toBe('kg');
    expect(body.resources.water.quantity).toBe(200);
    expect(body.resources.water.unit).toBe('L');
  });

  it('should accurately aggregate employment states', async () => {
    const locId = 'test-loc';
    await prisma.citizen.createMany({
      data: [
        {
          id: 'c1', name: 'A', gender: 'MALE', status: 'ACTIVE',
          birthDateJson: '{}', createdAtSimJson: '{}', vitalStateJson: '{}', personalityJson: '{}', skillsJson: '[]',
          employmentStatus: 'EMPLOYED', locationId: locId, movementState: 'IDLE'
        },
        {
          id: 'c2', name: 'B', gender: 'FEMALE', status: 'ACTIVE',
          birthDateJson: '{}', createdAtSimJson: '{}', vitalStateJson: '{}', personalityJson: '{}', skillsJson: '[]',
          employmentStatus: 'UNEMPLOYED', locationId: locId, movementState: 'IDLE'
        },
        {
          id: 'c3', name: 'C', gender: 'MALE', status: 'ACTIVE',
          birthDateJson: '{}', createdAtSimJson: '{}', vitalStateJson: '{}', personalityJson: '{}', skillsJson: '[]',
          employmentStatus: 'STUDENT', locationId: locId, movementState: 'IDLE'
        },
        {
          id: 'c4', name: 'D', gender: 'FEMALE', status: 'ACTIVE',
          birthDateJson: '{}', createdAtSimJson: '{}', vitalStateJson: '{}', personalityJson: '{}', skillsJson: '[]',
          employmentStatus: 'RETIRED', locationId: locId, movementState: 'IDLE'
        }
      ]
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/world/summary'
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    
    expect(body.population).toBe(4);
    expect(body.employment.employed).toBe(1);
    expect(body.employment.unemployed).toBe(1);
    expect(body.employment.students).toBe(1);
    expect(body.employment.retired).toBe(1);
    expect(body.employment.inactive).toBe(2);
    expect(body.employment.workforce).toBe(2); // employed + unemployed
  });
});
