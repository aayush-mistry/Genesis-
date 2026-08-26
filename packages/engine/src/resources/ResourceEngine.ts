import { ResourceManager } from './ResourceManager';
import { ResourceGenerator } from './ResourceGenerator';
import { ResourceCalculator } from './ResourceCalculator';
import { ResourceConsumptionEngine } from './ResourceConsumptionEngine';
import { WorldEngine } from '../world/WorldEngine';
import { EnvironmentEngine } from '../environment/EnvironmentEngine';
import { EventScheduler } from '../events/EventScheduler';
import { SimulationEvent } from '../events/SimulationEvent';
import { TimeEngine } from '../time/TimeEngine';
import { randomUUID } from 'crypto';

export class ResourceEngine {
  public resourceManager: ResourceManager;
  public resourceGenerator: ResourceGenerator;
  public resourceCalculator: ResourceCalculator;
  public resourceConsumptionEngine: ResourceConsumptionEngine;

  private worldEngine: WorldEngine;
  private environmentEngine: EnvironmentEngine;
  private eventScheduler: EventScheduler;
  private timeEngine: TimeEngine;
  private isInitialized = false;

  constructor(
    worldEngine: WorldEngine,
    environmentEngine: EnvironmentEngine,
    eventScheduler: EventScheduler,
    timeEngine: TimeEngine
  ) {
    this.worldEngine = worldEngine;
    this.environmentEngine = environmentEngine;
    this.eventScheduler = eventScheduler;
    this.timeEngine = timeEngine;

    this.resourceManager = new ResourceManager();
    this.resourceGenerator = new ResourceGenerator();
    this.resourceCalculator = new ResourceCalculator();
    this.resourceConsumptionEngine = new ResourceConsumptionEngine(this.resourceManager);
  }

  public initialize(): void {
    if (this.isInitialized) return;
    this.isInitialized = true;
    this.scheduleRegenerationCheck();
  }

  /**
   * Initializes resources for a newly created region.
   */
  public generateResourcesForRegion(regionId: string, worldSeed: number): void {
    const region = this.worldEngine.regionManager.getRegion(regionId);
    if (!region) return;

    const resources = this.resourceGenerator.generateForRegion(region, worldSeed);
    resources.forEach(res => this.resourceManager.addResource(res));
  }

  private scheduleRegenerationCheck(): void {
    const time = this.timeEngine.getCurrentTime();
    
    // We want this to run every simulation day (24 hours) for performance, 
    // but the calculator supports hourly if needed. Let's do Daily.
    const event: SimulationEvent = {
      id: randomUUID(),
      name: 'Resource Regeneration Tick',
      description: 'Periodic check to update renewable resources based on environment.',
      scheduledTime: { ...time },
      createdTime: { ...time },
      priority: 'Normal',
      status: 'Scheduled',
      cancelFlag: false,
      retryCount: 0,
      sourceModule: 'ResourceEngine',
      targetModule: 'ResourceEngine',
      recurrence: { interval: 'Day' }, // Daily regeneration
      handler: async (e: SimulationEvent) => {
        this.processRegeneration(24); // 24 hours elapsed
      }
    };

    this.eventScheduler.scheduleEvent(event);
  }

  public processRegeneration(hoursElapsed: number): void {
    const season = this.environmentEngine.seasonManager.getCurrentSeason();
    const dayPhase = this.environmentEngine.dayCycleManager.getCurrentPhase();
    
    // Iterate regions and update resources
    const regions = this.worldEngine.regionManager.getAllRegions();
    regions.forEach(region => {
      const envState = this.environmentEngine.getEnvironmentalState(region.id);
      const weather = this.environmentEngine.weatherManager.getRegionWeather(region.id);
      
      const resources = this.resourceManager.getResourcesByRegion(region.id);
      
      resources.forEach(resource => {
        const updates = this.resourceCalculator.calculateRegeneration(
          resource,
          envState,
          weather || null,
          season,
          dayPhase,
          hoursElapsed
        );
        
        if (Object.keys(updates).length > 0) {
          this.resourceManager.updateResource(region.id, resource.id, updates);
        }
      });
    });
  }

  public getResourceQuantity(regionId: string, resourceType: string): number {
    const resources = this.resourceManager.getResourcesByRegion(regionId);
    let total = 0;
    for (const res of resources) {
      if (res.type === resourceType) {
        total += res.currentAmount;
      }
    }
    return total;
  }
}
