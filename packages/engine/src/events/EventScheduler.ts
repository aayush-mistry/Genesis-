import { SimulationEvent, EventStatus, EventPriority } from './SimulationEvent';
import { MinHeap } from './MinHeap';
import { SimulationTime } from '../time/SimulationTime';
import { TimeEngine } from '../time/TimeEngine';
import { TimeUtils } from '../utils/TimeUtils';
import { EventEmitter } from 'events';

export interface EventLog {
  timestamp: string;
  message: string;
}

export class EventScheduler {
  private queue: MinHeap;
  private history: SimulationEvent[];
  private engine: TimeEngine | null;
  private maxHistorySize = 1000;
  
  public emitter = new EventEmitter();
  private logs: EventLog[] = [];
  private maxLogs = 1000;

  public stats = {
    queuedEvents: 0,
    executedEvents: 0,
    cancelledEvents: 0,
    failedEvents: 0,
    recurringEvents: 0,
    averageExecutionTime: 0,
    longestExecutionTime: 0,
    peakQueueSize: 0,
    totalEventsCreated: 0
  };

  public performance = {
    priorityQueueOperations: 0,
    schedulingTime: 0,
    executionTime: 0,
    memoryUsageMB: 0,
    cpuUsage: 0,
    lastTickDuration: 0,
    tickProcessingTime: 0,
    peakQueueLength: 0,
    averageQueueLength: 0,
  };

  private cumulativeQueueLength = 0;
  private queueLengthSamples = 0;

  constructor(engine?: TimeEngine) {
    this.queue = new MinHeap();
    this.history = [];
    this.engine = engine || null;

    if (this.engine) {
      // Subscribe to the engine ticks to automatically process events
      this.engine.subscribe((time) => {
        const start = performance.now();
        this.executeDueEvents(time).finally(() => {
          this.performance.tickProcessingTime = performance.now() - start;
          this.updatePerformanceMetrics();
        });
      });
    }
  }

  public logActivity(message: string): void {
    const log: EventLog = {
      timestamp: new Date().toISOString(),
      message
    };
    this.logs.unshift(log);
    if (this.logs.length > this.maxLogs) {
      this.logs.pop();
    }
    this.emitter.emit('log', log);
  }

  public getLogs(): EventLog[] {
    return this.logs;
  }

  private updatePerformanceMetrics() {
    this.performance.memoryUsageMB = Math.round(process.memoryUsage().heapUsed / 1024 / 1024 * 100) / 100;
    
    const queueSize = this.queue.size();
    if (queueSize > this.stats.peakQueueSize) {
      this.stats.peakQueueSize = queueSize;
      this.performance.peakQueueLength = queueSize;
    }
    
    this.cumulativeQueueLength += queueSize;
    this.queueLengthSamples++;
    this.performance.averageQueueLength = Math.round(this.cumulativeQueueLength / this.queueLengthSamples);
  }

  private recordStateTransition(event: SimulationEvent, newState: EventStatus, time: SimulationTime) {
    event.status = newState;
    if (!event.stateTransitions) {
      event.stateTransitions = [];
    }
    event.stateTransitions.push({ state: newState, time: TimeUtils.clone(time) });
  }

  /**
   * Schedules a new event in the queue.
   */
  public scheduleEvent(event: SimulationEvent): void {
    const start = performance.now();
    
    if (event.cancelFlag || event.status === 'Cancelled') return;
    
    this.recordStateTransition(event, 'Scheduled', event.createdTime);
    
    this.stats.totalEventsCreated++;
    if (event.recurrence) this.stats.recurringEvents++;
    
    this.queue.insert(event);
    this.stats.queuedEvents = this.queue.size();
    
    this.performance.priorityQueueOperations++;
    this.performance.schedulingTime += performance.now() - start;
    this.logActivity(`Event Queued: ${event.id} (${event.name})`);
  }

  /**
   * Cancels an existing event by its ID.
   */
  public cancelEvent(id: string): boolean {
    const events = this.queue.getEvents();
    const event = events.find(e => e.id === id);
    if (event) {
      event.cancelFlag = true;
      event.status = 'Cancelled';
      this.queue.removeById(id);
      this.stats.queuedEvents = this.queue.size();
      this.stats.cancelledEvents++;
      this.addToHistory(event);
      this.logActivity(`Event Cancelled: ${event.id}`);
      return true;
    }
    return false;
  }

  public pauseEvent(id: string): boolean {
    const events = this.queue.getEvents();
    const event = events.find(e => e.id === id);
    if (event) {
      this.queue.removeById(id);
      this.stats.queuedEvents = this.queue.size();
      event.status = 'Paused';
      this.addToHistory(event);
      this.logActivity(`Event Paused: ${event.id}`);
      return true;
    }
    return false;
  }

  public resumeEvent(id: string): boolean {
    const idx = this.history.findIndex(e => e.id === id && e.status === 'Paused');
    if (idx !== -1) {
      const event = this.history.splice(idx, 1)[0];
      event.status = 'Scheduled';
      this.queue.insert(event);
      this.stats.queuedEvents = this.queue.size();
      this.logActivity(`Event Resumed: ${event.id}`);
      return true;
    }
    return false;
  }

  public updateEventPriority(id: string, priority: EventPriority): boolean {
    const events = this.queue.getEvents();
    const event = events.find(e => e.id === id);
    if (event) {
      this.queue.removeById(id);
      event.priority = priority;
      this.queue.insert(event);
      this.logActivity(`Event Priority Updated: ${event.id} to ${priority}`);
      return true;
    }
    return false;
  }

  /**
   * Reschedules an event to a new time.
   */
  public rescheduleEvent(id: string, newTime: SimulationTime): boolean {
    const events = this.queue.getEvents();
    const event = events.find(e => e.id === id);
    if (event) {
      this.queue.removeById(id);
      event.scheduledTime = TimeUtils.clone(newTime);
      event.status = 'Scheduled';
      this.queue.insert(event);
      this.logActivity(`Event Rescheduled: ${event.id}`);
      return true;
    }
    return false;
  }

  /**
   * Retrieves an upcoming event by ID.
   */
  public getEvent(id: string): SimulationEvent | undefined {
    return this.queue.getEvents().find(e => e.id === id) || this.history.find(e => e.id === id);
  }

  /**
   * Returns all upcoming events in the queue (unsorted).
   */
  public getUpcomingEvents(): SimulationEvent[] {
    return this.queue.getEvents();
  }

  /**
   * Returns executed or cancelled events.
   */
  public getExecutedEvents(): SimulationEvent[] {
    return this.history;
  }

  /**
   * Clears all scheduled events from the queue.
   */
  public clearEvents(): void {
    this.queue.clear();
    this.stats.queuedEvents = 0;
    this.logActivity(`Queue Cleared`);
  }

  /**
   * Executes all events whose scheduled time is <= the current simulation time.
   */
  public async executeDueEvents(currentTime: SimulationTime): Promise<void> {
    this.logActivity(`Tick Started [${currentTime.year}-${currentTime.month}-${currentTime.day} ${currentTime.hour}:${currentTime.minute}:${currentTime.second}]`);
    while (this.queue.size() > 0) {
      const nextEvent = this.queue.peek();
      
      if (!nextEvent || TimeUtils.compare(nextEvent.scheduledTime, currentTime) > 0) {
        break;
      }

      this.performance.priorityQueueOperations++;
      const event = this.queue.extractMin()!;
      this.stats.queuedEvents = this.queue.size();

      if (event.cancelFlag || event.status === 'Cancelled') {
        this.recordStateTransition(event, 'Cancelled', currentTime);
        this.stats.cancelledEvents++;
        this.addToHistory(event);
        continue;
      }

      this.recordStateTransition(event, 'Executing', currentTime);
      event.executionTime = TimeUtils.clone(currentTime);
      
      const startExec = performance.now();
      try {
        await event.handler(event);
        this.recordStateTransition(event, 'Completed', currentTime);
        event.completionTime = TimeUtils.clone(currentTime);
        this.stats.executedEvents++;
      } catch (error) {
        console.error(`Error executing event ${event.id} (${event.name}):`, error);
        this.recordStateTransition(event, 'Failed', currentTime);
        event.completionTime = TimeUtils.clone(currentTime);
        event.executionResult = error;
        this.stats.failedEvents++;
      }
      
      const durationMs = performance.now() - startExec;
      event.executionDurationMs = durationMs;
      this.performance.executionTime += durationMs;
      
      const totalExecs = this.stats.executedEvents + this.stats.failedEvents;
      this.stats.averageExecutionTime = ((this.stats.averageExecutionTime * (totalExecs - 1)) + durationMs) / totalExecs;
      
      if (durationMs > this.stats.longestExecutionTime) {
        this.stats.longestExecutionTime = durationMs;
      }

      this.addToHistory(event);
      this.handleRecurrence(event, currentTime);
      this.logActivity(`Event Executed: ${event.id} (${event.name}) - Status: ${event.status}`);
    }
    this.logActivity(`Tick Completed`);
  }

  private handleRecurrence(event: SimulationEvent, currentTime: SimulationTime): void {
    if (event.status !== 'Completed' || !event.recurrence) return;

    event.recurrenceCount = (event.recurrenceCount || 0) + 1;

    if (event.recurrence.count !== undefined && event.recurrenceCount >= event.recurrence.count) {
      return;
    }

    const nextEvent: SimulationEvent = {
      ...event,
      id: `${event.id.split('-rec-')[0]}-rec-${event.recurrenceCount}`,
      status: 'Scheduled',
      createdTime: TimeUtils.clone(currentTime),
      executionTime: undefined,
      completionTime: undefined,
      executionResult: undefined,
      stateTransitions: [],
      executionDurationMs: undefined,
      scheduledTime: this.calculateNextRecurrenceTime(event.scheduledTime, event.recurrence.interval)
    };

    this.scheduleEvent(nextEvent);
    this.logActivity(`Recurring Event Rescheduled: ${nextEvent.id}`);
  }

  private calculateNextRecurrenceTime(baseTime: SimulationTime, interval: string): SimulationTime {
    const nextTime = TimeUtils.clone(baseTime);
    
    switch (interval) {
      case 'Hour': nextTime.hour += 1; break;
      case 'Day': nextTime.day += 1; break;
      case 'Week': nextTime.day += 7; break;
      case 'Month': nextTime.month += 1; break;
      case 'Year': nextTime.year += 1; break;
    }

    while (nextTime.hour >= 24) {
      nextTime.hour -= 24;
      nextTime.day += 1;
    }
    while (nextTime.day > 30) {
      nextTime.day -= 30;
      nextTime.month += 1;
    }
    while (nextTime.month > 12) {
      nextTime.month -= 12;
      nextTime.year += 1;
    }

    return nextTime;
  }

  private addToHistory(event: SimulationEvent): void {
    this.history.unshift(event);
    if (this.history.length > this.maxHistorySize) {
      this.history.pop();
    }
  }
}
