import { buildApp } from '../../app';
import { PrismaClient } from '@prisma/client';
import { FastifyInstance } from 'fastify';
import { EventRegistry } from '@genesis/engine';

const prisma = new PrismaClient();

describe('World Lifecycle API', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    // We assume the DB has been migrated and is empty.
    await prisma.citizen.deleteMany();
    await prisma.workplace.deleteMany();
    await prisma.building.deleteMany();
    await prisma.district.deleteMany();
    await prisma.city.deleteMany();
    await prisma.region.deleteMany();
    await prisma.world.deleteMany();
    
    // Reset memory
    const { worldService } = await import('../../services/world.service');
    worldService.engine.reset();
    
    const { supplyService } = await import('../../services/supply.service');
    supplyService.reset();
    
    app = await buildApp();
    await app.ready();
  }, 30000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    await prisma.$disconnect();
    EventRegistry.clear();
  });

  let createdWorldId: string;

  it('TEST 1 - Check Active World', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/world'
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).not.toBeNull();
    expect(body).toHaveProperty('id');
  });

  it('TEST 2 - Create World', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/world',
      payload: { name: 'Integration Test World', seed: 42, description: 'Test' }
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveProperty('id');
    createdWorldId = body.id;

    // Verify it exists in SQLite
    const worldInDb = await prisma.world.findUnique({ where: { id: createdWorldId } });
    expect(worldInDb).not.toBeNull();
    expect(worldInDb?.name).toBe('Integration Test World');
  }, 60000);

  it('TEST 3 - API READ', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/world'
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.id).toBe(createdWorldId);
  });

  it('TEST 6 - Destroy World', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/v1/world'
    });
    expect(res.statusCode).toBe(200);
  });
});
