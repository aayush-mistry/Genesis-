import { WorldEngine } from '../world/WorldEngine';
import { SeasonManager } from './SeasonManager';
import { ClimateManager } from './ClimateManager';
import { WeatherData, WeatherType, SeasonType } from '@genesis/shared';
import { EventScheduler } from '../events/EventScheduler';
import { SimulationEvent } from '../events/SimulationEvent';
import { SimulationTime } from '../time/SimulationTime';
import { randomUUID } from 'crypto';

// Weighted probabilities [Sunny, Cloudy, Fog, Light Rain, Rain, Storm, Light Snow, Heavy Snow]
type TransitionWeights = Record<WeatherType, number>;

export class WeatherManager {
  private worldEngine: WorldEngine;
  private seasonManager: SeasonManager;
  private climateManager: ClimateManager;
  private eventScheduler: EventScheduler;
  
  private weatherState: Map<string, WeatherData> = new Map(); // regionId -> WeatherData

  constructor(
    worldEngine: WorldEngine, 
    seasonManager: SeasonManager, 
    climateManager: ClimateManager,
    eventScheduler: EventScheduler
  ) {
    this.worldEngine = worldEngine;
    this.seasonManager = seasonManager;
    this.climateManager = climateManager;
    this.eventScheduler = eventScheduler;
  }

  public getRegionWeather(regionId: string): WeatherData | undefined {
    return this.weatherState.get(regionId);
  }

  public getAllWeather(): WeatherData[] {
    return Array.from(this.weatherState.values());
  }

  public update(time: SimulationTime): void {
    const regions = this.worldEngine.regionManager.getAllRegions();
    const currentSeason = this.seasonManager.getCurrentSeason();

    for (const region of regions) {
      const climate = this.climateManager.getProfile(region.climate as import('@genesis/shared').ClimateType);
      if (!climate) continue;

      let weather = this.weatherState.get(region.id);
      
      // Initialize weather if not present
      if (!weather) {
        weather = {
          regionId: region.id,
          currentType: 'Sunny',
          durationHours: 0,
          timeInCurrentWeather: 0
        };
        this.weatherState.set(region.id, weather);
      }

      weather.timeInCurrentWeather += 1;

      // Force transition if time exceeded or roll for natural transition
      // E.g., check every hour. If timeInCurrentWeather > durationHours, transition.
      if (weather.durationHours === 0 || weather.timeInCurrentWeather >= weather.durationHours) {
        this.transitionWeather(weather, climate.type, currentSeason, time);
      } else {
        // Spatial Coherence check: can a neighbor's storm blow over?
        this.checkNeighborInfluence(weather, region.id, time);
      }
    }
  }

  private transitionWeather(weather: WeatherData, climateType: string, season: SeasonType, time: SimulationTime): void {
    const oldWeather = weather.currentType;
    
    // A simplified Markov-like transition matrix based on current weather
    const transitions = this.getTransitions(oldWeather, season);
    const newWeather = this.rollWeighted(transitions);

    weather.currentType = newWeather;
    weather.timeInCurrentWeather = 0;
    
    // Random duration between 2 to 12 hours for a weather event
    weather.durationHours = Math.floor(Math.random() * 10) + 2;
    weather.frontId = randomUUID(); // Generate a new front id for tracking storms across regions

    if (oldWeather !== newWeather) {
      this.emitWeatherChangeEvent(weather.regionId, oldWeather, newWeather, time);
    }
  }

  private checkNeighborInfluence(weather: WeatherData, regionId: string, time: SimulationTime): void {
    // Spatial coherence: if a neighbor has a 'Storm' or 'Rain' and we have 'Sunny', we might transition to 'Cloudy' early.
    // NOTE: Spatial querying is simplified here. We assume regions are close if they are in the same world for this prototype.
    // Ideally, WorldEngine would provide `getNeighborRegions(regionId)`.
    
    // Let's pretend region array index distance implies spatial closeness for now, 
    // or just randomly bleed weather fronts.
    const regions = this.worldEngine.regionManager.getAllRegions();
    
    // In a real grid, we'd check actual neighbors. For now, just pick a random other region to act as 'wind'.
    if (regions.length > 1) {
      const neighbor = regions[Math.floor(Math.random() * regions.length)];
      if (neighbor.id !== regionId) {
        const neighborWeather = this.weatherState.get(neighbor.id);
        if (neighborWeather && neighborWeather.frontId) {
          // If neighbor has intense weather and we are clear, we degrade
          if ((neighborWeather.currentType === 'Storm' || neighborWeather.currentType === 'Rain') && weather.currentType === 'Sunny') {
            if (Math.random() > 0.7) { // 30% chance to be influenced
              const oldWeather = weather.currentType;
              weather.currentType = 'Cloudy'; // Front moving in
              weather.timeInCurrentWeather = 0;
              weather.durationHours = Math.floor(Math.random() * 4) + 1;
              weather.frontId = neighborWeather.frontId; // Share the front ID!
              
              this.emitWeatherChangeEvent(weather.regionId, oldWeather, weather.currentType, time, weather.frontId);
            }
          }
        }
      }
    }
  }

  private getTransitions(currentWeather: WeatherType, season: SeasonType): TransitionWeights {
    // Default fallback transitions (very simplified)
    const base: TransitionWeights = {
      'Sunny': 0, 'Cloudy': 0, 'Fog': 0, 'Light Rain': 0, 'Rain': 0, 'Storm': 0, 'Light Snow': 0, 'Heavy Snow': 0
    };

    switch (currentWeather) {
      case 'Sunny':
        base['Sunny'] = season === 'Summer' ? 70 : 30;
        base['Cloudy'] = 20;
        base['Fog'] = season === 'Winter' ? 10 : 0;
        break;
      case 'Cloudy':
        base['Sunny'] = 30;
        base['Cloudy'] = 40;
        base['Light Rain'] = season !== 'Winter' ? 20 : 0;
        base['Light Snow'] = season === 'Winter' ? 20 : 0;
        base['Fog'] = 10;
        break;
      case 'Fog':
        base['Sunny'] = 40;
        base['Cloudy'] = 60;
        break;
      case 'Light Rain':
        base['Cloudy'] = 40;
        base['Rain'] = 50;
        base['Sunny'] = 10;
        break;
      case 'Rain':
        base['Light Rain'] = 40;
        base['Storm'] = 20;
        base['Cloudy'] = 40;
        break;
      case 'Storm':
        base['Rain'] = 80;
        base['Cloudy'] = 20;
        break;
      case 'Light Snow':
        base['Cloudy'] = 40;
        base['Heavy Snow'] = 40;
        base['Sunny'] = 20;
        break;
      case 'Heavy Snow':
        base['Light Snow'] = 80;
        base['Cloudy'] = 20;
        break;
    }

    return base;
  }

  private rollWeighted(weights: TransitionWeights): WeatherType {
    const total = Object.values(weights).reduce((a, b) => a + b, 0);
    let roll = Math.random() * total;
    
    for (const [type, weight] of Object.entries(weights)) {
      if (roll < weight) return type as WeatherType;
      roll -= weight;
    }
    
    return 'Sunny'; // Fallback
  }

  private emitWeatherChangeEvent(regionId: string, oldWeather: WeatherType, newWeather: WeatherType, time: SimulationTime, frontId?: string): void {
    const event: SimulationEvent = {
      id: randomUUID(),
      name: `Weather Update in ${regionId}`,
      description: `Weather transitioned from ${oldWeather} to ${newWeather}.`,
      scheduledTime: { ...time },
      createdTime: { ...time },
      priority: 'Normal',
      status: 'Completed',
      cancelFlag: false,
      retryCount: 0,
      sourceModule: 'EnvironmentEngine',
      targetModule: 'Global',
      tags: ['environment', 'weather', regionId],
      metadata: { regionId, oldWeather, newWeather, frontId },
      handler: async () => {}
    };

    this.eventScheduler.scheduleEvent(event);
  }
}
