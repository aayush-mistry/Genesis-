import { SimulationTime } from './SimulationTime';

export type TimeEngineState = 'Running' | 'Paused' | 'Stopped' | 'Reset';
export type TimeSubscriber = (time: SimulationTime) => void;

export class TimeEngine {
  private time: SimulationTime;
  private state: TimeEngineState;
  private speedMultiplier: number;
  private subscribers: Set<TimeSubscriber>;
  private intervalId: NodeJS.Timeout | null;
  private readonly TICK_RATE_MS = 1000; // Real-world tick interval (1 second by default)
  
  public lastTickDurationMs = 0;
  public ticksPerSecond = 0;
  private tickCount = 0;
  private lastTpsCalculateTime = 0;
  public startTime = 0;

  constructor() {
    this.time = this.getDefaultTime();
    this.state = 'Stopped';
    this.speedMultiplier = 1; // 1 real second = 1 sim second by default
    this.subscribers = new Set();
    this.intervalId = null;
    this.startTime = Date.now();
  }

  private getDefaultTime(): SimulationTime {
    return {
      year: 1,
      month: 1,
      day: 1,
      hour: 0,
      minute: 0,
      second: 0,
    };
  }

  public getUptimeSeconds(): number {
    return Math.floor((Date.now() - this.startTime) / 1000);
  }

  /**
   * Starts the time engine if it is not already running.
   */
  public start(): void {
    if (this.state === 'Running') return;
    
    this.state = 'Running';
    this.startInterval();
  }

  /**
   * Pauses the time engine.
   */
  public pause(): void {
    if (this.state !== 'Running') return;
    
    this.state = 'Paused';
    this.stopInterval();
  }

  /**
   * Resumes the time engine from a paused state.
   */
  public resume(): void {
    if (this.state !== 'Paused') return;
    
    this.state = 'Running';
    this.startInterval();
  }

  /**
   * Stops the time engine completely.
   */
  public stop(): void {
    this.state = 'Stopped';
    this.stopInterval();
  }

  /**
   * Resets the time engine to the default time and stops it.
   */
  public reset(): void {
    this.stop();
    this.time = this.getDefaultTime();
    this.state = 'Reset';
    this.notifySubscribers();
  }

  /**
   * Advances the simulation time manually or via the internal loop.
   */
  public tick(): void {
    if (this.state !== 'Running') return;
    
    const start = performance.now();

    this.advanceTime(this.speedMultiplier);
    this.notifySubscribers();
    
    this.lastTickDurationMs = performance.now() - start;
    this.tickCount++;
    
    const now = Date.now();
    if (now - this.lastTpsCalculateTime >= 1000) {
      this.ticksPerSecond = this.tickCount;
      this.tickCount = 0;
      this.lastTpsCalculateTime = now;
    }
  }

  /**
   * Sets the speed multiplier of the simulation.
   * e.g., speed = 60 means 1 real second advances 60 simulation seconds (1 minute)
   */
  public setSpeed(speed: number): void {
    if (speed <= 0) return;
    this.speedMultiplier = speed;
  }

  /**
   * Returns the current simulation time.
   */
  public getCurrentTime(): SimulationTime {
    return { ...this.time };
  }

  /**
   * Returns the current engine state.
   */
  public getState(): TimeEngineState {
    return this.state;
  }

  /**
   * Returns the current speed multiplier.
   */
  public getSpeed(): number {
    return this.speedMultiplier;
  }

  /**
   * Subscribes a listener to time updates.
   */
  public subscribe(callback: TimeSubscriber): void {
    this.subscribers.add(callback);
  }

  /**
   * Unsubscribes a listener from time updates.
   */
  public unsubscribe(callback: TimeSubscriber): void {
    this.subscribers.delete(callback);
  }

  private startInterval(): void {
    this.stopInterval();
    this.intervalId = setInterval(() => {
      this.tick();
    }, this.TICK_RATE_MS);
  }

  private stopInterval(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private notifySubscribers(): void {
    for (const callback of this.subscribers) {
      try {
        callback(this.getCurrentTime());
      } catch (error) {
        console.error('Error in TimeEngine subscriber:', error);
      }
    }
  }

  public advance(secondsToAdd: number): void {
    this.advanceTime(secondsToAdd);
  }

  private advanceTime(secondsToAdd: number): void {
    let { year, month, day, hour, minute, second } = this.time;

    second += secondsToAdd;

    while (second >= 60) {
      second -= 60;
      minute += 1;
    }

    while (minute >= 60) {
      minute -= 60;
      hour += 1;
    }

    while (hour >= 24) {
      hour -= 24;
      day += 1;
    }

    // Simplified calendar: 30 days per month, 12 months per year
    while (day > 30) {
      day -= 30;
      month += 1;
    }

    while (month > 12) {
      month -= 12;
      year += 1;
    }

    this.time = { year, month, day, hour, minute, second };
  }
}
