import { WorldEngine } from '../../world/WorldEngine';
import { TimeEngine } from '../../time/TimeEngine';
import { EventScheduler } from '../../events/EventScheduler';
import { InventoryManager } from '../../inventory/InventoryManager';
import { CitizenService } from '../../citizen/services/CitizenService';
import { InMemoryCitizenRepository } from '../../citizen/repositories/InMemoryCitizenRepository';
import { SpatialEngine } from '../../spatial/SpatialEngine';
import { SpatialQueryService } from '../../spatial/SpatialQueryService';
import { MarketEngine } from '../MarketEngine';
import { CitizenGender, JobType, WorkplaceType, ActionType, ActionState } from '@genesis/shared';
import { SalaryService } from '../../citizen/services/SalaryService';

describe('Commerce Integration (Phase 6.4)', () => {
  let worldEngine: WorldEngine;
  let timeEngine: TimeEngine;
  let eventScheduler: EventScheduler;
  let marketEngine: MarketEngine;
  let inventoryManager: InventoryManager;
  let citizenService: CitizenService;
  let salaryService: SalaryService;
  let spatialEngine: SpatialEngine;
  
  beforeEach(() => {
    worldEngine = new WorldEngine();
    timeEngine = new TimeEngine();
    eventScheduler = new EventScheduler(timeEngine);
    inventoryManager = new InventoryManager();
    spatialEngine = new SpatialEngine(worldEngine, eventScheduler);

    const citizenRepo = new InMemoryCitizenRepository();
    citizenService = new CitizenService(
      citizenRepo, 
      worldEngine, 
      timeEngine, 
      eventScheduler, 
      spatialEngine.queryService
    , new (require('../../citizen/services/HouseholdService').HouseholdService)(new (require('../../inventory/InventoryManager').InventoryManager)()));

    // Provide a mocked perception service to return our store
    citizenService.setPerceptionService({
      generateSnapshot: (citizenId: string) => {
        return {
          self: citizenService.getCitizen(citizenId),
          nearbyCitizens: [],
          nearbyBuildings: [
            { id: 'store-1', type: 'STORE', location: { x: 0, y: 0 } }
          ],
          nearbyResources: [],
          timeOfDay: 'MORNING',
          weather: 'CLEAR'
        } as any;
      }
    } as any);

    marketEngine = new MarketEngine(
      worldEngine, 
      timeEngine, 
      eventScheduler, 
      (id) => citizenService.getCitizen(id)?.wallet,
      inventoryManager
    );

    const { StoreRanker } = require('../../decision/scoring/StoreRanker');
    citizenService.initializeSalaryService(marketEngine, new StoreRanker(marketEngine, inventoryManager), spatialEngine.queryService);
    salaryService = citizenService.salaryService!;
    citizenService.actionExecutor.setMarketEngine(marketEngine, new (require('../../decision/scoring/StoreRanker').StoreRanker)(marketEngine, inventoryManager), spatialEngine.queryService);
  });

  it('should successfully execute a purchase action end-to-end', async () => {
    // 1. Setup World & Retailer
    worldEngine.worldManager.createWorld('Genesis', 'Test', 123);
    const region = worldEngine.regionManager.createRegion({ name: 'r1', location: { x: 0, y: 0 } } as any);
    const city = worldEngine.cityManager.createCity({ name: 'c1', regionId: region.id, location: { x: 0, y: 0 } } as any);
    const district = worldEngine.districtManager.createDistrict({ name: 'd1', cityId: city.id, type: 'COMMERCIAL' } as any);
    
    // Create a store
    const store = {
      id: 'store-1',
      type: WorkplaceType.SHOP,
      locationId: district.id,
      regionId: region.id,
      capacity: 10,
      occupiedPositions: 0,
      vacancies: 1,
      positions: [],
      inventoryId: 'inv-store-1',
      wallet: { balance: 1000, totalIncome: 0, totalExpenses: 0, currency: 'INR' }
    };
    worldEngine.workplaceRepository.create(store as any);

    inventoryManager.createInventory('inv-store-1', 'store-1', 1000);
    inventoryManager.addItemQuantity('inv-store-1', 'wheat', 50, 'kg');

    // 2. Setup Citizen with high hunger and sufficient money
    const citizen = citizenService.createCitizen(CitizenGender.FEMALE, district.id);
    citizen.wallet.balance = 500;
    citizen.locationId = 'store-1'; // Already at the store so we skip spatial routing
    
    // Force extreme hunger
    citizen.vitalState.hunger = 100;
    citizen.vitalState.energy = 100;    // Not tired
    
    // Instead of relying on DecisionEngine (which might pick EAT), we manually inject PURCHASE
    // because this test is specifically for Commerce/Purchase integration end-to-end.
    const candidateAction = {
      type: ActionType.PURCHASE,
      source: 'HUNGER',
      reason: 'Need food',
      target: { id: 'store-1', type: 'BUILDING' },
      metadata: { productId: 'wheat', quantity: 1 }
    };

    // Execute actions
    citizenService.actionExecutor.executeAction(citizen, candidateAction);

    expect(citizen.currentAction).toBeDefined();
    expect(citizen.currentAction!.actionType).toBe(ActionType.PURCHASE);
    expect(citizen.currentAction!.target?.id).toBe('store-1');

    // Action should be completed immediately since they are in the same district/location
    expect(citizen.currentAction!.state).toBe(ActionState.COMPLETED);

    // 4. Verify Commerce impacts
    
    // Citizen should have spent money (base price 10)
    expect(citizen.wallet.balance).toBe(490);
    
    // Store should have received money
    expect(store.wallet!.balance).toBe(1010);

    // Inventory transfers
    const storeWheat = inventoryManager.getInventory('inv-store-1')?.items['wheat']?.totalQuantity || 0;
    expect(storeWheat).toBe(49); // Started at 50

    const citizenInvId = `inv-${citizen.id}`;
    const citizenWheat = inventoryManager.getInventory(citizenInvId)?.items['wheat']?.totalQuantity || 0;
    expect(citizenWheat).toBe(1);

    // Verify hunger did NOT decrease (consumption is out of scope for Phase 6.4)
    expect(citizen.vitalState.hunger).toBe(100);
  });

  it('should process salary payments successfully', () => {
    worldEngine.worldManager.createWorld('Genesis', 'Test', 123);
    const region = worldEngine.regionManager.createRegion({ name: 'r1', location: { x: 0, y: 0 } } as any);
    const city = worldEngine.cityManager.createCity({ name: 'c1', regionId: region.id, location: { x: 0, y: 0 } } as any);
    const district = worldEngine.districtManager.createDistrict({ name: 'd1', cityId: city.id, type: 'COMMERCIAL' } as any);

    // 1. Setup Workplace
    const wp = {
      id: 'wp-1',
      type: WorkplaceType.FARM,
      locationId: district.id,
      regionId: region.id,
      capacity: 10,
      occupiedPositions: 1,
      vacancies: 0,
      positions: [
        { id: 'pos-1', type: JobType.FARMER, workplaceId: 'wp-1', occupantId: 'citizen-000002', requiredSkills: {}, schedule: { startTime: 8, endTime: 16 } }
      ],
      wallet: { balance: 10000, totalIncome: 0, totalExpenses: 0, currency: 'INR' }
    };
    worldEngine.workplaceRepository.create(wp as any);

    // 2. Setup Citizen
    const citizen = citizenService.createCitizen(CitizenGender.MALE, district.id);
    citizen.employmentStatus = 'EMPLOYED' as any;
    citizen.workplaceId = 'wp-1';
    citizen.jobType = JobType.FARMER;
    citizen.wallet.balance = 0;

    // 3. Trigger Payroll
    salaryService.runPayrollCycle();

    // 4. Verify
    // Farmer base salary is 1500, risk is 1.1 -> 1650
    expect(citizen.wallet.balance).toBe(1650);
    expect(wp.wallet!.balance).toBe(10000 - 1650);
  });
});


