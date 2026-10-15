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

import { EventRegistry } from '../events/EventRegistry';

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

  private completedIntervalIds: Set<string> = new Set();

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
    
    EventRegistry.register('ResourceEngine.processRegeneration', async (event?: SimulationEvent | string) => {
      this.processRegeneration(event);
    });
  }

  public recordProcessedInterval(intervalId: string): void {
    this.completedIntervalIds.add(intervalId);
  }

  public isIntervalProcessed(intervalId: string): boolean {
    return this.completedIntervalIds.has(intervalId);
  }

  public getProcessedIntervalIds(): string[] {
    return Array.from(this.completedIntervalIds);
  }

  public clearProcessedIntervals(): void {
    this.completedIntervalIds.clear();
  }

  public initialize(): void {
    if (this.isInitialized) return;
    this.isInitialized = true;
    this.scheduleRegenerationCheck();
  }

  public clear(): void {
    this.resourceManager.clear();
    this.completedIntervalIds.clear();
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
    const existingUpcoming = this.eventScheduler.getUpcomingEvents().find(
      e => e.handlerName === 'ResourceEngine.processRegeneration' && !e.cancelFlag && e.status !== 'Cancelled'
    );
    if (existingUpcoming) {
      return;
    }

    const time = this.timeEngine.getCurrentTime();
    const intervalId = `regen-interval-${time.year}-${time.month}-${time.day}`;
    
    // We want this to run every simulation day (24 hours) for performance, 
    // but the calculator supports hourly if needed. Let's do Daily.
    const event: SimulationEvent = {
      id: intervalId,
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
      handlerName: 'ResourceEngine.processRegeneration',
      metadata: { intervalId, hoursElapsed: 24 }
    };

    this.eventScheduler.scheduleEvent(event);
  }

  public processRegeneration(eventOrHours?: SimulationEvent | string | number, hoursElapsedParam?: number): void {
    let intervalId: string | undefined;
    let hoursElapsed = 24;

    if (typeof eventOrHours === 'object' && eventOrHours !== null) {
      intervalId = (eventOrHours.metadata?.intervalId as string) || eventOrHours.id;
      hoursElapsed = (eventOrHours.metadata?.hoursElapsed as number) || 24;
    } else if (typeof eventOrHours === 'string') {
      intervalId = eventOrHours;
      hoursElapsed = hoursElapsedParam ?? 24;
    } else if (typeof eventOrHours === 'number') {
      hoursElapsed = eventOrHours;
    }

    // Idempotency check: prevent duplicate resource regeneration for the same interval
    if (intervalId && this.isIntervalProcessed(intervalId)) {
      return;
    }

    const season = this.environmentEngine.seasonManager.getCurrentSeason();
    const dayPhase = this.environmentEngine.dayCycleManager.getCurrentPhase();
    
    // Iterate regions with resources
    const regionIds = Array.from(new Set([
      ...this.worldEngine.regionManager.getAllRegions().map(r => r.id),
      ...this.resourceManager.getRegionIds()
    ]));

    regionIds.forEach(regionId => {
      const envState = this.environmentEngine.getEnvironmentalState(regionId);
      const weather = this.environmentEngine.weatherManager.getRegionWeather(regionId);
      
      const resources = this.resourceManager.getResourcesByRegion(regionId);
      
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
          this.resourceManager.updateResource(regionId, resource.id, updates);
        }
      });
    });

    if (intervalId) {
      this.recordProcessedInterval(intervalId);
    }
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
