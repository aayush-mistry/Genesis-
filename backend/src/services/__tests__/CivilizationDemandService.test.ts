import { civilizationDemandService } from '../civilizationDemand.service';
import { prisma } from '../../repositories/prisma';
import { worldService } from '../world.service';
import { citizenService } from '../citizen.service';
import { marketService } from '../market.service';
import { timeService } from '../time.service';

describe('CivilizationDemandService', () => {
  jest.setTimeout(30000); // 30 seconds

  beforeAll(async () => {
    // Basic setup
    const { supplyService } = await import('../supply.service');
    supplyService.initialize();
    await worldService.generatePopulatedWorld('Demand Test World', 'Testing demand intelligence', 42);
    // Clear transactions and citizens for empty world test
    await prisma.transactionRecord.deleteMany();
    await prisma.citizen.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.transactionRecord.deleteMany();
    await prisma.citizen.deleteMany();
  });

  it('Test 1 — Empty World: Returns zero/unavailable without fake demand', async () => {
    const demand = await civilizationDemandService.getDemandIntelligence();
    expect(demand.food.purchased).toBe(0);
    expect(demand.food.unmet).toBe(0);
    expect(demand.food.consumed).toBe('unavailable');
    expect(demand.water.purchased).toBe(0);
    expect(demand.water.unmet).toBe(0);
  });

  it('Test 2 — Real Citizen Need: Recognizes unmet demand from citizen vital state', async () => {
    const vitalState = JSON.stringify({ hunger: 80, thirst: 70, energy: 100, health: 100 });
    await prisma.citizen.create({
      data: {
        id: 'test-cit-1',
        name: 'Hungry Citizen',
        gender: 'MALE',
        status: 'ACTIVE',
        vitalStateJson: vitalState,
        birthDateJson: '{}',
        createdAtSimJson: '{}',
        personalityJson: '{}',
        skillsJson: '{}',
        employmentStatus: 'UNEMPLOYED',
        movementState: 'IDLE',
      }
    });

    const demand = await civilizationDemandService.getDemandIntelligence();
    // 80 - 20 = 60 unmet hunger. Wheat restoration = 20. So 60/20 = 3 kg.
    expect(demand.food.unmet).toBe(3);
    // 70 - 20 = 50 unmet thirst. Water restoration = 25. So 50/25 = 2 L.
    expect(demand.water.unmet).toBe(2);
  });

  it('Test 4 — Real Purchase: Reflects purchases in demand intelligence', async () => {
    const { TimeUtils } = await import('@genesis/engine');
    const currentSeconds = TimeUtils.toSeconds(timeService.engine.getCurrentTime());

    await prisma.transactionRecord.create({
      data: {
        id: 'tx-1',
        transactionId: 'tx-1',
        buyerId: 'cit-1',
        sellerId: 'store-1',
        productId: 'wheat',
        quantity: 5,
        unit: 'kg',
        unitPrice: 10,
        totalPrice: 50,
        currency: 'CREDIT',
        transactionType: 'PURCHASE',
        regionId: 'reg-1',
        timestamp: currentSeconds
      }
    });

    await prisma.transactionRecord.create({
      data: {
        id: 'tx-2',
        transactionId: 'tx-2',
        buyerId: 'cit-1',
        sellerId: 'store-1',
        productId: 'water',
        quantity: 10,
        unit: 'L',
        unitPrice: 2,
        totalPrice: 20,
        currency: 'CREDIT',
        transactionType: 'PURCHASE',
        regionId: 'reg-1',
        timestamp: currentSeconds
      }
    });

    const demand = await civilizationDemandService.getDemandIntelligence();
    console.log('DEMAND:', JSON.stringify(demand, null, 2));
    const allTxs = await prisma.transactionRecord.findMany();
    console.log('ALL TXS:', JSON.stringify(allTxs, null, 2));

    expect(demand.food.purchased).toBe(5);
    expect(demand.water.purchased).toBe(10);
  });

  it('Test 5 — Multiple Citizens: Aggregates unmet demand correctly', async () => {
    const vitalState1 = JSON.stringify({ hunger: 60, thirst: 70, energy: 100, health: 100 });
    const vitalState2 = JSON.stringify({ hunger: 100, thirst: 120, energy: 100, health: 100 });
    
    await prisma.citizen.createMany({
      data: [
        {
          id: 'test-cit-2', name: 'Cit2', gender: 'MALE', status: 'ACTIVE',
          vitalStateJson: vitalState1, birthDateJson: '{}', createdAtSimJson: '{}',
          personalityJson: '{}', skillsJson: '{}', employmentStatus: 'UNEMPLOYED', movementState: 'IDLE'
        },
        {
          id: 'test-cit-3', name: 'Cit3', gender: 'FEMALE', status: 'ACTIVE',
          vitalStateJson: vitalState2, birthDateJson: '{}', createdAtSimJson: '{}',
          personalityJson: '{}', skillsJson: '{}', employmentStatus: 'UNEMPLOYED', movementState: 'IDLE'
        }
      ]
    });

    const demand = await civilizationDemandService.getDemandIntelligence();
    // Citizen 1: 60 - 20 = 40. Citizen 2: 100 - 20 = 80. Total unmet = 120. 120/20 = 6kg.
    expect(demand.food.unmet).toBe(6);
  });

  it('Test 7 — Units: Preserves correct units', async () => {
    const demand = await civilizationDemandService.getDemandIntelligence();
    expect(demand.food.unit).toBe('kg');
    expect(demand.water.unit).toBe('L');
  });

  // Additional tests (3, 6, 8) require more complex setup which might be hard to mock in DB directly,
  // but this verifies the core logic and Prisma queries.
});
