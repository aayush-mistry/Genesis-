import { WorldEngine } from '../world/WorldEngine';
import { EventScheduler } from '../events/EventScheduler';
import { TimeEngine } from '../time/TimeEngine';
import { InventoryManager } from '../inventory/InventoryManager';
import { ResourceEngine } from '../resources/ResourceEngine';
import { EnvironmentEngine } from '../environment/EnvironmentEngine';
import { 
  Commodity, 
  ProductionDefinition, 
  CropDefinition, 
  CropYieldBreakdown, 
  Workplace, 
  WorkplaceType, 
  SeasonType, 
  WeatherType,
  ResourceType 
} from '@genesis/shared';
import { SimulationEvent } from '../events/SimulationEvent';
import { randomUUID } from 'crypto';
import { EventRegistry } from '../events/EventRegistry';
import { TimeUtils } from '../utils/TimeUtils';
import { AgriculturalYieldCalculator } from './AgriculturalYieldCalculator';
import { WHEAT_CROP_DEFINITION } from './CropDefinitions';

export class ProductionEngine {
  private isInitialized = false;
  private completedCycleIds: Set<string> = new Set();
  
  public commodities: Map<string, Commodity> = new Map();
  public productionDefinitions: Map<string, ProductionDefinition> = new Map();
  public cropDefinitions: Map<string, CropDefinition> = new Map();
  public recentCropYieldReports: Map<string, CropYieldBreakdown> = new Map();

  constructor(
    private worldEngine: WorldEngine,
    private eventScheduler: EventScheduler,
    private timeEngine: TimeEngine,
    private inventoryManager: InventoryManager,
    private resourceEngine: ResourceEngine,
    private environmentEngine?: EnvironmentEngine
  ) {
    // Register default wheat crop definition
    this.registerCropDefinition(WHEAT_CROP_DEFINITION);

    EventRegistry.register('ProductionEngine.runProductionCycle', async (event?: SimulationEvent) => {
      this.runProductionCycle(event);
    });
  }

  public setEnvironmentEngine(environmentEngine: EnvironmentEngine): void {
    this.environmentEngine = environmentEngine;
  }

  public registerCommodity(commodity: Commodity) {
    this.commodities.set(commodity.id, commodity);
  }

  public registerProductionDefinition(definition: ProductionDefinition) {
    this.productionDefinitions.set(definition.productId, definition);
    if ((definition as CropDefinition).suitableSeasons !== undefined) {
      this.cropDefinitions.set(definition.productId, definition as CropDefinition);
    }
  }

  public registerCropDefinition(crop: CropDefinition) {
    this.cropDefinitions.set(crop.productId, crop);
    this.productionDefinitions.set(crop.productId, crop);
  }

  public getCropDefinition(productId: string): CropDefinition | undefined {
    return this.cropDefinitions.get(productId);
  }

  public getCropYieldReport(workplaceId: string): CropYieldBreakdown | undefined {
    return this.recentCropYieldReports.get(workplaceId);
  }

  public getAllCropYieldReports(): CropYieldBreakdown[] {
    return Array.from(this.recentCropYieldReports.values());
  }

  public isCycleCompleted(cycleId: string): boolean {
    if (this.completedCycleIds.has(cycleId)) return true;
    if (this.eventScheduler) {
      const executed = this.eventScheduler.getExecutedEvents();
      if (executed.some(e => (e.id === cycleId || e.metadata?.cycleId === cycleId) && e.status === 'Completed')) {
        this.completedCycleIds.add(cycleId);
        return true;
      }
    }
    return false;
  }

  public recordCompletedCycle(cycleId: string): void {
    this.completedCycleIds.add(cycleId);
  }

  public getCompletedCycleIds(): string[] {
    return Array.from(this.completedCycleIds);
  }

  public clearCompletedCycles(): void {
    this.completedCycleIds.clear();
  }

  public initialize(): void {
    if (this.isInitialized) return;
    this.isInitialized = true;

    this.scheduleProductionCycle();
  }

  private scheduleProductionCycle(): void {
    const existingUpcoming = this.eventScheduler.getUpcomingEvents().find(
      e => e.handlerName === 'ProductionEngine.runProductionCycle' && !e.cancelFlag && e.status !== 'Cancelled'
    );
    if (existingUpcoming) {
      return;
    }

    const time = this.timeEngine.getCurrentTime();
    const cycleId = `prod-cycle-${time.year}-${time.month}-${time.day}`;
    
    const event: SimulationEvent = {
      id: cycleId,
      name: 'Daily Production Cycle',
      description: 'Calculates production for all producers and updates inventories.',
      scheduledTime: { ...time }, 
      createdTime: { ...time },
      priority: 'Normal',
      status: 'Scheduled',
      cancelFlag: false,
      retryCount: 0,
      sourceModule: 'ProductionEngine',
      targetModule: 'ProductionEngine',
      recurrence: { interval: 'Day' }, // Daily recurring
      handlerName: 'ProductionEngine.runProductionCycle',
      metadata: { cycleId }
    };

    this.eventScheduler.scheduleEvent(event);
  }

  public runProductionCycle(cycleOrEvent?: SimulationEvent | string): void {
    let cycleId: string;
    if (typeof cycleOrEvent === 'string') {
      cycleId = cycleOrEvent;
    } else if (cycleOrEvent && typeof cycleOrEvent === 'object') {
      cycleId = (cycleOrEvent.metadata?.cycleId as string) || cycleOrEvent.id;
    } else {
      cycleId = `adhoc-${randomUUID()}`;
    }

    if (this.isCycleCompleted(cycleId)) {
      return;
    }

    const workplaces = this.worldEngine.workplaceRepository.findAll();

    for (const workplace of workplaces) {
      if (this.isProducer(workplace)) {
        this.processProductionForWorkplace(workplace);
      }
    }

    this.completedCycleIds.add(cycleId);
  }

  private isProducer(workplace: Workplace): boolean {
    return [
      WorkplaceType.FARM, 
      WorkplaceType.FISHING_SITE, 
      WorkplaceType.MINE, 
      WorkplaceType.FOREST_SITE, 
      WorkplaceType.FACTORY
    ].includes(workplace.type);
  }

  private processProductionForWorkplace(workplace: Workplace): void {
    if (!workplace.inventoryId) return;

    // Determine what they produce
    let producedProductId = null;
    
    // 1. Check metadata
    if (workplace.metadata?.producesProductId) {
       producedProductId = workplace.metadata.producesProductId as string;
    } else {
       // 2. Fallback to definitions by workplaceType
       for (const def of this.productionDefinitions.values()) {
         if (def.workplaceType === workplace.type) {
           producedProductId = def.productId;
           break;
         }
       }
    }

    if (!producedProductId) return;

    const definition = this.productionDefinitions.get(producedProductId);
    if (!definition) return;

    const commodity = this.commodities.get(producedProductId);
    if (!commodity) return;

    // 1. Capacity based on land/size
    const baseCapacity = (workplace.capacity / definition.workersRequiredPerUnitArea) * definition.baseYieldPerArea;

    // 2. Adjust based on workers actually present (authoritative JobPosition counting)
    const occupiedCount = workplace.positions ? workplace.positions.filter(p => p.occupantId !== null).length : (workplace.occupiedPositions ?? 0);
    const workerEfficiency = workplace.capacity > 0 ? (occupiedCount / workplace.capacity) : 0;
    let actualProduction = baseCapacity * workerEfficiency;

    // 3. Environmental Yield Calculation for Agricultural Crops
    const isAgricultural = workplace.type === WorkplaceType.FARM || this.cropDefinitions.has(producedProductId);
    let cropYieldBreakdown: CropYieldBreakdown | undefined = undefined;

    if (isAgricultural) {
      const cropDef = this.cropDefinitions.get(producedProductId) || ({
        ...definition,
        cropType: producedProductId.toUpperCase(),
        suitableSeasons: ['Spring', 'Summer', 'Autumn'] as SeasonType[],
        temperatureRange: { minViable: 0, optimalMin: 15, optimalMax: 25, maxViable: 35 },
        growingPeriod: 1,
        suitableSoil: ['PLAIN', 'GRASSLANDS'],
        unsuitableSeasonMultiplier: 0.0
      } as CropDefinition);

      const envEngine = this.environmentEngine || (this.resourceEngine as any)?.environmentEngine;
      const currentTime = this.timeEngine.getCurrentTime();
      const currentTimeSeconds = TimeUtils.toSeconds(currentTime);

      const season: SeasonType = envEngine?.seasonManager 
        ? envEngine.seasonManager.getCurrentSeason()
        : this.getSeasonFromMonth(currentTime.month);

      const weather: WeatherType | null = envEngine?.weatherManager 
        ? envEngine.weatherManager.getRegionWeather(workplace.regionId)?.currentType || null
        : null;

      const envState = envEngine?.getEnvironmentalState ? envEngine.getEnvironmentalState(workplace.regionId) : null;
      const temperature: number | null = envState?.temperature ?? null;

      // Authoritative soil measurement from region resources or terrain
      let soilType: string | null = null;
      if (this.resourceEngine?.resourceManager) {
        const regionalResources = this.resourceEngine.resourceManager.getResourcesByRegion(workplace.regionId);
        const hasGrassland = regionalResources.some(r => r.type === 'GRASSLANDS');
        if (hasGrassland) soilType = 'GRASSLANDS';
      }

      // Check water availability ratio
      let waterAvailabilityRatio = 1.0;
      const waterReq = cropDef.resourceRequirements?.find(r => r.resourceId === 'WATER' || (r.resourceId as any) === ResourceType.WATER)
        || definition.resourceRequirements?.find(r => r.resourceId === 'WATER' || (r.resourceId as any) === ResourceType.WATER);

      if (waterReq && waterReq.amountPerOutputUnit > 0 && this.resourceEngine?.resourceManager) {
        const waterResources = this.resourceEngine.resourceManager.getResourcesByRegion(workplace.regionId)
          .filter(r => r.type === 'WATER' || (r.type as any) === ResourceType.WATER);
        if (waterResources.length > 0) {
          const totalWaterLitres = waterResources.reduce((sum, r) => {
            const isCubicMeters = r.unit === 'm³' || r.unit === 'm3' || r.unit === 'cubic_meter' || r.unit === 'cubic_meters';
            const amountInLitres = isCubicMeters ? r.currentAmount * 1000 : r.currentAmount;
            return sum + Math.max(0, amountInLitres);
          }, 0);
          const plannedHarvestKg = baseCapacity * workerEfficiency;
          const neededWaterLitres = plannedHarvestKg * waterReq.amountPerOutputUnit;
          if (neededWaterLitres > 0) {
            waterAvailabilityRatio = Math.max(0, Math.min(1.0, totalWaterLitres / neededWaterLitres));
          } else {
            waterAvailabilityRatio = 1.0;
          }
        } else {
          // Documented neutral fallback when local water data is unavailable
          waterAvailabilityRatio = 1.0;
        }
      }

      cropYieldBreakdown = AgriculturalYieldCalculator.calculateYield(
        cropDef,
        { season, temperature, weather, soilType, waterAvailabilityRatio },
        { baseCapacity, workerEfficiency },
        { workplaceId: workplace.id, regionId: workplace.regionId, timestamp: currentTimeSeconds }
      );

      this.recentCropYieldReports.set(workplace.id, cropYieldBreakdown);
      this.eventScheduler.emitter.emit('CropYieldEvaluated', cropYieldBreakdown);
      actualProduction = cropYieldBreakdown.finalYield;
    }

    const effectiveDefinition: ProductionDefinition = isAgricultural && (!definition.resourceRequirements || definition.resourceRequirements.length === 0)
      ? {
          ...definition,
          resourceRequirements: this.cropDefinitions.get(producedProductId)?.resourceRequirements
        }
      : definition;

    // 4. Resource Feasibility & Input Constraints
    const maxFeasibleProduction = this.resourceEngine.resourceConsumptionEngine.calculateMaximumProduction(
      effectiveDefinition,
      actualProduction,
      workplace.id,
      workplace.regionId
    );

    if (maxFeasibleProduction < actualProduction) {
      if (cropYieldBreakdown) {
        cropYieldBreakdown.status = 'RESOURCE_CONSTRAINED';
        cropYieldBreakdown.explanation += `; Resource constrained (Capped from ${actualProduction} to ${maxFeasibleProduction} by available inputs)`;
        cropYieldBreakdown.finalYield = maxFeasibleProduction;
      }
      actualProduction = maxFeasibleProduction;
    }

    if (actualProduction > 0) {
      // Allocate resources
      const allocation = this.resourceEngine.resourceConsumptionEngine.allocateResources(
        effectiveDefinition,
        actualProduction,
        workplace.id,
        workplace.regionId
      );

      if (allocation) {
        // Compute acquiredAt and expiryAt
        const currentTime = this.timeEngine.getCurrentTime();
        const currentTimeSeconds = TimeUtils.toSeconds(currentTime);
        let expiryAt: number | undefined = undefined;
        if (commodity.perishable && commodity.perishable.shelfLifeHours) {
          expiryAt = currentTimeSeconds + (commodity.perishable.shelfLifeHours * 3600);
        }

        // Produce goods
        const success = this.inventoryManager.addItemQuantity(
          workplace.inventoryId, 
          producedProductId, 
          actualProduction, 
          commodity.unit,
          currentTimeSeconds,
          expiryAt
        );

        if (success) {
          // Consume resources exactly once
          const consumed = this.resourceEngine.resourceConsumptionEngine.consumeResources(allocation.allocationId);

          if (consumed) {
            // Emit Event
            this.eventScheduler.emitter.emit('ProductionCompleted', {
              producerId: workplace.id,
              productId: producedProductId,
              quantity: actualProduction,
              unit: commodity.unit,
              regionId: workplace.regionId,
              timestamp: this.timeEngine.getCurrentTime(),
              yieldMultiplier: cropYieldBreakdown?.overallEnvironmentalMultiplier ?? 1.0,
              cropStatus: cropYieldBreakdown?.status,
              resourcesConsumed: allocation.consumedResources.reduce((acc: any, curr) => {
                 acc[curr.resourceType] = curr.amount;
                 return acc;
              }, {})
            });
          } else {
            // Roll back inventory if consumption failed
            this.inventoryManager.removeItemQuantity(workplace.inventoryId, producedProductId, actualProduction);
          }
        } else {
          // Revert allocation if inventory failed
          this.resourceEngine.resourceConsumptionEngine.releaseReservation(allocation.allocationId);
        }
      }
    }
  }

  private getSeasonFromMonth(month: number): SeasonType {
    if (month >= 1 && month <= 3) return 'Spring';
    if (month >= 4 && month <= 6) return 'Summer';
    if (month >= 7 && month <= 9) return 'Autumn';
    return 'Winter';
  }
}

