import { buildApp } from '../../app';
import { PrismaClient } from '@prisma/client';
import { FastifyInstance } from 'fastify';
import { EventRegistry } from '@genesis/engine';
import { bankingRepository } from '../../repositories/BankingRepository';

const prisma = new PrismaClient();

describe('Banking Integration', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    // We assume the DB has been migrated and is empty.
    await prisma.creditHistory.deleteMany();
    await prisma.citizen.deleteMany();
    await prisma.workplace.deleteMany();
    await prisma.building.deleteMany();
    await prisma.district.deleteMany();
    await prisma.city.deleteMany();
    await prisma.region.deleteMany();
    await prisma.world.deleteMany();
    
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

  it('TEST - Graceful handling of malformed historyEventsJson', async () => {
    const ownerId = 'citizen-bank-test-1';
    
    // Setup a malformed JSON string in the DB
    await prisma.creditHistory.create({
      data: {
        ownerId,
        creditScore: 700,
        historyEventsJson: '{ malformed json'
      }
    });

    // Try to append an event via the repository (this triggered the previous bug)
    await bankingRepository.createOrUpdateCreditHistory(ownerId, 710, 'Loan paid on time');
    
    // Fetch and verify it didn't corrupt the DB and actually reset/appended properly
    const updated = await prisma.creditHistory.findUnique({ where: { ownerId } });
    expect(updated).not.toBeNull();
    expect(updated!.creditScore).toBe(710);
    
    const events = JSON.parse(updated!.historyEventsJson);
    expect(Array.isArray(events)).toBeTruthy();
    expect(events.length).toBe(1);
    expect(events[0].event).toBe('Loan paid on time');
  });
});
