import { CitizenService, InMemoryCitizenRepository, PopulationSimulator, HouseholdService } from '@genesis/engine';
import { worldService } from './world.service';
import { timeService } from './time.service';
import { eventService } from './event.service';
import { spatialService } from './spatial.service';
import { supplyService } from './supply.service';

class BackendCitizenService {
  public engine: CitizenService;
  public simulator: PopulationSimulator;
  public dirtyCitizenIds: Set<string> = new Set();
  public dirtyHouseholdIds: Set<string> = new Set();

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
        const cities = worldService.engine.cityManager.getAllCities();
        if (cities.length > 0) return cities[0].id;
        const regions = worldService.engine.regionManager.getAllRegions();
        return regions.length > 0 ? regions[0].id : null;
      }
    );

    this.simulator.onDemographicEvent = (evt) => {
      this.dirtyCitizenIds.add(evt.citizen.id);
      if (evt.citizen.householdId) {
        this.dirtyHouseholdIds.add(evt.citizen.householdId);
      }
    };
  }

  public markDirtyCitizen(id: string): void {
    this.dirtyCitizenIds.add(id);
  }

  public markDirtyHousehold(id: string): void {
    this.dirtyHouseholdIds.add(id);
  }

  public getAndClearDirtyCollections(): { citizens: string[]; households: string[] } {
    const result = {
      citizens: Array.from(this.dirtyCitizenIds),
      households: Array.from(this.dirtyHouseholdIds)
    };
    this.dirtyCitizenIds.clear();
    this.dirtyHouseholdIds.clear();
    return result;
  }

  public reset(): void {
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
        const cities = worldService.engine.cityManager.getAllCities();
        if (cities.length > 0) return cities[0].id;
        const regions = worldService.engine.regionManager.getAllRegions();
        return regions.length > 0 ? regions[0].id : null;
      }
    );
    this.dirtyCitizenIds.clear();
    this.dirtyHouseholdIds.clear();
  }

  public async initialize(): Promise<void> {
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

        this.engine.salaryService!.setTransactionChecker(async (txIds: string[]) => {
          const { prisma } = await import('../repositories/prisma');
          const txs = await prisma.transactionRecord.findMany({
            where: { transactionId: { in: txIds } },
            select: { transactionId: true }
          });
          return new Set(txs.map(t => t.transactionId));
        });
      });
    });
    
    // Schedule Needs updates
    this.engine.needsService.scheduleNeedsUpdate(eventService.scheduler, timeService.engine.getCurrentTime());
    
    await Promise.all([
      import('./supply.service'),
      import('./consumption.service'),
      import('./resource.service'),
      import('./market.service')
    ]).then(([{ supplyService }, { consumptionService }, { resourceService }, { marketService }]) => {
      const { ConsumptionEngine } = require('@genesis/engine');
      const getCommodity = (id: string) => supplyService.productionEngine.commodities.get(id);
      const consumptionEngine = new ConsumptionEngine(
        supplyService.inventoryManager,
        this.engine.needsService,
        getCommodity,
        consumptionService.consumptionLedger
      );

      if (resourceService?.engine?.resourceConsumptionEngine) {
        consumptionEngine.setResourceConsumptionEngine(resourceService.engine.resourceConsumptionEngine);
      }
      if (marketService?.engine) {
        consumptionEngine.setMarketEngine(marketService.engine);
      }

      // Water connection checker
      consumptionEngine.setWaterConnectionChecker((citizen: any) => {
        if (!citizen.householdId) return { connected: false };
        const hh = this.engine.householdService.getHousehold(citizen.householdId);
        if (!hh || !hh.locationId) return { connected: false };
        const building = worldService.engine.buildingManager.getBuilding(hh.locationId);
        if (!building) return { connected: false };
        const isConnected = worldService.engine.buildingManager.hasWaterConnection(building.id);
        
        let regionId = 'DEFAULT';
        try {
          const district = worldService.engine.districtManager.getDistrict(building.districtId);
          if (district?.cityId) {
            const city = worldService.engine.cityManager.getCity(district.cityId);
            if (city?.regionId) regionId = city.regionId;
          }
        } catch (_) {}

        return { connected: isConnected, buildingId: building.id, regionId };
      });

      // Region resolver from spatial world engine
      consumptionEngine.setRegionResolver((citizen: any) => {
        try {
          if (citizen.locationId) {
            const building = worldService.engine.buildingManager.getBuilding(citizen.locationId);
            if (building?.districtId) {
              const district = worldService.engine.districtManager.getDistrict(building.districtId);
              if (district?.cityId) {
                const city = worldService.engine.cityManager.getCity(district.cityId);
                if (city?.regionId) return city.regionId;
              }
            }
          }
        } catch (e) {}
        const regions = worldService.engine.regionManager.getAllRegions();
        return regions.length > 0 ? regions[0].id : 'DEFAULT';
      });

      this.engine.actionExecutor.setConsumptionEngine(consumptionEngine);
    });

    console.log('[Citizen Engine] Initialized and Simulator started');
  }
}

export const citizenService = new BackendCitizenService();
