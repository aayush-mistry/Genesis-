import { SimulationTime } from '../time/SimulationTime';
import { SeasonType } from '@genesis/shared';
import { EventScheduler } from '../events/EventScheduler';
import { SimulationEvent } from '../events/SimulationEvent';
import { v4 as uuidv4 } from 'uuid';

export class SeasonManager {
  private currentSeason: SeasonType = 'Spring';
  private eventScheduler: EventScheduler;

  constructor(eventScheduler: EventScheduler) {
    this.eventScheduler = eventScheduler;
  }

  public getSeasonFromMonth(month: number): SeasonType {
    if (month >= 1 && month <= 3) return 'Spring';
    if (month >= 4 && month <= 6) return 'Summer';
    if (month >= 7 && month <= 9) return 'Autumn';
    return 'Winter'; // 10-12
  }

  public getCurrentSeason(): SeasonType {
    return this.currentSeason;
  }

  public update(time: SimulationTime): void {
    const calculatedSeason = this.getSeasonFromMonth(time.month);
    if (calculatedSeason !== this.currentSeason) {
      const oldSeason = this.currentSeason;
      this.currentSeason = calculatedSeason;
      
      this.emitSeasonChangeEvent(time, oldSeason, this.currentSeason);
    }
  }

  private emitSeasonChangeEvent(time: SimulationTime, oldSeason: SeasonType, newSeason: SeasonType): void {
    const event: SimulationEvent = {
      id: uuidv4(),
      name: `Season Changed to ${newSeason}`,
      description: `The season transitioned from ${oldSeason} to ${newSeason}.`,
      scheduledTime: { ...time },
      createdTime: { ...time },
      priority: 'High',
      status: 'Completed',
      cancelFlag: false,
      retryCount: 0,
      sourceModule: 'EnvironmentEngine',
      targetModule: 'Global',
      tags: ['environment', 'season'],
      metadata: { oldSeason, newSeason },
      handler: async () => { /* No-op, just for history tracking */ }
    };

    // Push directly to history since it already happened, or we could schedule it for "now"
    // To cleanly interact with EventScheduler, we'll schedule it with priority handling if we want plugins to react.
    // For now, scheduling it slightly in the future (1 second) or handling synchronously.
    
    // We will just let EventScheduler run it immediately.
    this.eventScheduler.scheduleEvent(event);
  }
}
