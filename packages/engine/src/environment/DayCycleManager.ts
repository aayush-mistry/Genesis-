import { SimulationTime } from '../time/SimulationTime';
import { DayPhaseType } from '@genesis/shared';
import { EventScheduler } from '../events/EventScheduler';
import { SimulationEvent } from '../events/SimulationEvent';
import { randomUUID } from 'crypto';

export class DayCycleManager {
  private currentPhase: DayPhaseType = 'Night';
  private eventScheduler: EventScheduler;

  constructor(eventScheduler: EventScheduler) {
    this.eventScheduler = eventScheduler;
  }

  public getPhaseFromHour(hour: number): DayPhaseType {
    if (hour >= 0 && hour < 6) return 'Night';
    if (hour >= 6 && hour < 8) return 'Dawn';
    if (hour >= 8 && hour < 12) return 'Morning';
    if (hour >= 12 && hour < 17) return 'Afternoon';
    if (hour >= 17 && hour < 20) return 'Evening';
    return 'Night'; // 20-23
  }

  public getCurrentPhase(): DayPhaseType {
    return this.currentPhase;
  }

  public update(time: SimulationTime): void {
    const calculatedPhase = this.getPhaseFromHour(time.hour);
    
    if (calculatedPhase !== this.currentPhase) {
      const oldPhase = this.currentPhase;
      this.currentPhase = calculatedPhase;
      this.emitPhaseChangeEvent(time, oldPhase, this.currentPhase);
      
      // Also emit Sunrise/Sunset events for specific phases
      if (this.currentPhase === 'Dawn') {
        this.emitSunriseEvent(time);
      } else if (this.currentPhase === 'Evening') {
        this.emitSunsetEvent(time);
      }
    }
  }

  private emitPhaseChangeEvent(time: SimulationTime, oldPhase: DayPhaseType, newPhase: DayPhaseType): void {
    const changeEvent: SimulationEvent = {
      id: randomUUID(),
      name: `Day Phase Change: ${newPhase}`,
      description: `Transitioned to ${newPhase}.`,
      scheduledTime: { ...time },
      createdTime: { ...time },
      priority: 'High',
      status: 'Completed',
      cancelFlag: false,
      retryCount: 0,
      sourceModule: 'EnvironmentEngine',
      targetModule: 'Global',
      tags: ['environment', 'day-cycle', newPhase],
      metadata: { oldPhase, newPhase },
      handler: async () => {} // The event itself is the notification
    };
    this.eventScheduler.scheduleEvent(changeEvent);
  }

  private emitSunriseEvent(time: SimulationTime): void {
    const sunriseEvent: SimulationEvent = {
      id: randomUUID(),
      name: `Sunrise`,
      description: `The sun is rising.`,
      scheduledTime: { ...time },
      createdTime: { ...time },
      priority: 'Normal',
      status: 'Completed',
      cancelFlag: false,
      retryCount: 0,
      sourceModule: 'EnvironmentEngine',
      targetModule: 'Global',
      tags: ['environment', 'day-cycle', 'sunrise'],
      metadata: {},
      handler: async () => {}
    };
    this.eventScheduler.scheduleEvent(sunriseEvent);
  }

  private emitSunsetEvent(time: SimulationTime): void {
    const event: SimulationEvent = {
      id: randomUUID(),
      name: `Sunset`,
      description: `The sun is setting.`,
      scheduledTime: { ...time },
      createdTime: { ...time },
      priority: 'Normal',
      status: 'Completed',
      cancelFlag: false,
      retryCount: 0,
      sourceModule: 'EnvironmentEngine',
      targetModule: 'Global',
      tags: ['environment', 'day-cycle', 'sunset'],
      metadata: {},
      handler: async () => {}
    };
    this.eventScheduler.scheduleEvent(event);
  }
}
