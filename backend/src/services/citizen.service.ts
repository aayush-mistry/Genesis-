import { CitizenService, InMemoryCitizenRepository, PopulationSimulator, HouseholdService } from '@genesis/engine';
import { worldService } from './world.service';
import { timeService } from './time.service';
import { eventService } from './event.service';
import { spatialService } from './spatial.service';
import { supplyService } from './supply.service';

class BackendCitizenService {
  public engine: CitizenService;
  public simulator: PopulationSimulator;

  constructor() {
    const repository = new InMemoryCitizenRepository();
    const householdService = new HouseholdService(supplyService.inventoryManager);
    this.engine = new CitizenService(
      repository, 
      worldService.engine, 
      timeService.engine,
      eventService.scheduler,
      spatialService.engine.queryService,
      householdService
    );
    this.simulator = new PopulationSimulator(
      this.engine, 
      timeService.engine,
      undefined,
      undefined,
      () => {
        const regions = worldService.engine.regionManager.getAllRegions();
        return regions.length > 0 ? regions[0].id : null;
      }
    );
  }

  public initialize() {
    // In the future, this might load existing citizens from a database.
    this.simulator.start();
    
    // Connect SalaryService to MarketEngine
    import('./market.service').then(({ marketService }) => {
      import('./supply.service').then(({ supplyService }) => {
        const { StoreRanker } = require('@genesis/engine/src/decision/scoring/StoreRanker');
        const storeRanker = new StoreRanker(marketService.engine, supplyService.inventoryManager);
        this.engine.initializeSalaryService(
          marketService.engine,
          storeRanker,
          spatialService.engine.queryService
        );
      });
    });
    
    // Schedule Needs updates
    this.engine.needsService.scheduleNeedsUpdate(eventService.scheduler, timeService.engine.getCurrentTime());
    
    import('./supply.service').then(({ supplyService }) => {
      const { ConsumptionEngine } = require('@genesis/engine');
      const getCommodity = (id: string) => supplyService.productionEngine.commodities.get(id);
      const consumptionEngine = new ConsumptionEngine(
        supplyService.inventoryManager,
        this.engine.needsService,
        getCommodity
      );
      this.engine.actionExecutor.setConsumptionEngine(consumptionEngine);
    });

    console.log('[Citizen Engine] Initialized and Simulator started');
  }
}

export const citizenService = new BackendCitizenService();
