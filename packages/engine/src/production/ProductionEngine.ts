import { WorldEngine } from '../world/WorldEngine';
import { EventScheduler } from '../events/EventScheduler';
import { TimeEngine } from '../time/TimeEngine';
import { InventoryManager } from '../inventory/InventoryManager';
import { ResourceEngine } from '../resources/ResourceEngine';
import { Commodity, ProductionDefinition, Workplace, WorkplaceType } from '@genesis/shared';
import { SimulationEvent } from '../events/SimulationEvent';
import { randomUUID } from 'crypto';

export class ProductionEngine {
  private isInitialized = false;
  
  public commodities: Map<string, Commodity> = new Map();
  public productionDefinitions: Map<string, ProductionDefinition> = new Map();

  constructor(
    private worldEngine: WorldEngine,
    private eventScheduler: EventScheduler,
    private timeEngine: TimeEngine,
    private inventoryManager: InventoryManager,
    private resourceEngine: ResourceEngine
  ) {}

  public registerCommodity(commodity: Commodity) {
    this.commodities.set(commodity.id, commodity);
  }

  public registerProductionDefinition(definition: ProductionDefinition) {
    this.productionDefinitions.set(definition.productId, definition);
  }

  public initialize(): void {
    if (this.isInitialized) return;
    this.isInitialized = true;

    this.scheduleProductionCycle();
  }

  private scheduleProductionCycle(): void {
    const time = this.timeEngine.getCurrentTime();
    
    // We want this to run every simulation day (or could be Hour, but daily is good for bulk production)
    // Actually, maybe let's do it daily to match "growingPeriod: days"
    const event: SimulationEvent = {
      id: randomUUID(),
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
      handler: async (e: SimulationEvent) => {
        this.runProductionCycle();
      }
    };

    this.eventScheduler.scheduleEvent(event);
  }

  private runProductionCycle(): void {
    const workplaces = this.worldEngine.workplaceRepository.findAll();

    for (const workplace of workplaces) {
      if (this.isProducer(workplace)) {
        this.processProductionForWorkplace(workplace);
      }
    }
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

    // 2. Adjust based on workers actually present (occupiedPositions vs capacity)
    const workerEfficiency = workplace.occupiedPositions / workplace.capacity;
    let actualProduction = baseCapacity * workerEfficiency;

    // 3. Environment & Resources
    const maxFeasibleProduction = this.resourceEngine.resourceConsumptionEngine.calculateMaximumProduction(
      definition,
      actualProduction,
      workplace.id,
      workplace.regionId
    );

    actualProduction = maxFeasibleProduction;

    if (actualProduction > 0) {
      // Allocate resources
      const allocation = this.resourceEngine.resourceConsumptionEngine.allocateResources(
        definition,
        actualProduction,
        workplace.id,
        workplace.regionId
      );

      if (allocation) {
        // Produce goods
        const success = this.inventoryManager.addItemQuantity(workplace.inventoryId, producedProductId, actualProduction, commodity.unit);

        if (success) {
          // Consume resources
          this.resourceEngine.resourceConsumptionEngine.consumeResources(allocation.allocationId);

          // Emit Event
          this.eventScheduler.emitter.emit('ProductionCompleted', {
            producerId: workplace.id,
            productId: producedProductId,
            quantity: actualProduction,
            unit: commodity.unit,
            regionId: workplace.regionId,
            timestamp: this.timeEngine.getCurrentTime(),
            resourcesConsumed: allocation.consumedResources.reduce((acc: any, curr) => {
               acc[curr.resourceType] = curr.amount;
               return acc;
            }, {})
          });
        } else {
          // Revert allocation if inventory failed
          this.resourceEngine.resourceConsumptionEngine.releaseReservation(allocation.allocationId);
        }
      }
    }
  }
}
