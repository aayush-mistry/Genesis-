import { ProductionCostCalculator } from '../ProductionCostCalculator';
import { WorldEngine } from '../../world/WorldEngine';
import { WorkplaceType, Citizen } from '@genesis/shared';
import { ResourceValuation } from '../ResourceValuationConfig';

describe('ProductionCostCalculator', () => {
  let worldEngine: WorldEngine;
  let calculator: ProductionCostCalculator;

  beforeEach(() => {
    worldEngine = new WorldEngine();
    calculator = new ProductionCostCalculator(worldEngine);
  });

  test('calculates correct cost with citizen provider and resources', () => {
    const workplaceId = 'factory-1';
    
    worldEngine.workplaceRepository.create({
      id: workplaceId,
      type: WorkplaceType.FACTORY,
      regionId: 'reg-1',
      locationId: 'loc-1',
      capacity: 10,
      occupiedPositions: 1,
      vacancies: 9,
      positions: [
        { id: 'pos-1', workplaceId, type: 'FACTORY_WORKER' as any, occupantId: 'cit-1', requiredSkills: {}, schedule: { startTime: 8, endTime: 16 } }
      ]
    });

    // Setup citizen provider
    const mockCitizen: Citizen = {
      id: 'cit-1',
      jobType: 'FACTORY_WORKER' as any,
      skills: [],
      employmentRecord: {
        daysWorked: 30,
        expectedWorkingDays: 30,
        performanceScore: 1.0,
        startDate: { year: 1, month: 1, day: 1, hour: 0, minute: 0 },
        endDate: null,
        lastPaymentDate: null
      }
    } as any;

    calculator.citizenProvider = (id) => id === 'cit-1' ? mockCitizen : undefined;

    // JobBaseSalary for FACTORY_WORKER is 2000
    // JobRiskMultiplier for FACTORY_WORKER is 1.2
    // Monthly salary = 2000 * 1.2 = 2400
    // Daily labor cost = 2400 / 30 = 80
    
    // Resource cost: IRON=20, WATER=1 (from ResourceValuationConfig)
    // Consumed: IRON: 10, WATER: 50 -> 200 + 50 = 250
    
    const resourcesConsumed = { 'IRON': 10, 'WATER': 50 };
    
    const result = calculator.calculateCost(workplaceId, resourcesConsumed);
    
    expect(result.workplaceId).toBe(workplaceId);
    expect(result.laborCost).toBeCloseTo(80);
    expect(result.inputCost).toBe(250);
    expect(result.operatingCost).toBe(0);
    expect(result.totalCost).toBeCloseTo(330);
  });
  
  test('handles zero production inputs gracefully', () => {
    const workplaceId = 'farm-1';
    worldEngine.workplaceRepository.create({
      id: workplaceId,
      type: WorkplaceType.FARM,
      regionId: 'reg-1',
      locationId: 'loc-1',
      capacity: 10,
      occupiedPositions: 0,
      vacancies: 10,
      positions: []
    });

    const result = calculator.calculateCost(workplaceId, {});
    
    expect(result.laborCost).toBe(0);
    expect(result.inputCost).toBe(0);
    expect(result.totalCost).toBe(0);
  });
});
