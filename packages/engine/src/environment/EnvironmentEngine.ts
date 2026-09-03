import { WorldEngine } from '../world/WorldEngine';
import { EventScheduler } from '../events/EventScheduler';
import { SimulationEvent } from '../events/SimulationEvent';
import { TimeEngine } from '../time/TimeEngine';
import { ClimateManager } from './ClimateManager';
import { SeasonManager } from './SeasonManager';
import { DayCycleManager } from './DayCycleManager';
import { WeatherManager } from './WeatherManager';
import { EnvironmentCalculator } from './EnvironmentCalculator';
import { EnvironmentalState } from '@genesis/shared';
import { randomUUID } from 'crypto';
import { EventRegistry } from '../events/EventRegistry';

export class EnvironmentEngine {
  public climateManager: ClimateManager;
  public seasonManager: SeasonManager;
  public dayCycleManager: DayCycleManager;
  public weatherManager: WeatherManager;
  public environmentCalculator: EnvironmentCalculator;

  private worldEngine: WorldEngine;
  private eventScheduler: EventScheduler;
  private timeEngine: TimeEngine;
  private isInitialized = false;

  constructor(worldEngine: WorldEngine, eventScheduler: EventScheduler, timeEngine: TimeEngine) {
    this.worldEngine = worldEngine;
    this.eventScheduler = eventScheduler;
    this.timeEngine = timeEngine;

    this.climateManager = new ClimateManager();
    this.seasonManager = new SeasonManager(this.eventScheduler);
    this.dayCycleManager = new DayCycleManager(this.eventScheduler);
    this.weatherManager = new WeatherManager(
      this.worldEngine, 
      this.seasonManager, 
      this.climateManager,
      this.eventScheduler
    );
    this.environmentCalculator = new EnvironmentCalculator();
    
    EventRegistry.register('EnvironmentEngine.updateState', async (e: SimulationEvent) => {
      this.seasonManager.update(e.scheduledTime);
      this.dayCycleManager.update(e.scheduledTime);
      this.weatherManager.update(e.scheduledTime);
    });
  }

  public initialize(): void {
    if (this.isInitialized) return;
    this.isInitialized = true;

    // We do NOT poll every tick. We schedule a recurring hourly event to update the environment state.
    this.scheduleEnvironmentCheck();
  }

  private scheduleEnvironmentCheck(): void {
    const time = this.timeEngine.getCurrentTime();
    
    // We want this to run every simulation hour
    const event: SimulationEvent = {
      id: randomUUID(),
      name: 'Environment State Check',
      description: 'Periodic check to update day phase, seasons, and weather transitions.',
      scheduledTime: { ...time }, // Start immediately
      createdTime: { ...time },
      priority: 'Normal',
      status: 'Scheduled',
      cancelFlag: false,
      retryCount: 0,
      sourceModule: 'EnvironmentEngine',
      targetModule: 'EnvironmentEngine',
      recurrence: { interval: 'Hour' }, // Recurring event
      handlerName: 'EnvironmentEngine.updateState'
    };

    this.eventScheduler.scheduleEvent(event);
  }

  /**
   * Dynamically calculates and returns the current environmental state for a given region.
   */
  public getEnvironmentalState(regionId: string): EnvironmentalState | null {
    const region = this.worldEngine.regionManager.getRegion(regionId);
    if (!region) return null;

    const climate = this.climateManager.getProfile(region.climate as import('@genesis/shared').ClimateType);
    if (!climate) return null;

    let weather = this.weatherManager.getRegionWeather(regionId);
    if (!weather) {
      // Fallback if weather hasn't updated yet
      weather = {
        regionId,
        currentType: 'Sunny',
        durationHours: 0,
        timeInCurrentWeather: 0
      };
    }

    const season = this.seasonManager.getCurrentSeason();
    const dayPhase = this.dayCycleManager.getCurrentPhase();

    return this.environmentCalculator.calculateCurrentState(regionId, climate, weather, season, dayPhase);
  }
}
