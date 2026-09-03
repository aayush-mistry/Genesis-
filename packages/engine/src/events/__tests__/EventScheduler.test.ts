import { EventScheduler } from '../EventScheduler';
import { SimulationEvent, EventPriority, EventHandler } from '../SimulationEvent';
import { TimeEngine } from '../../time/TimeEngine';
import { EventRegistry } from '../EventRegistry';

describe('EventScheduler', () => {
  let engine: TimeEngine;
  let scheduler: EventScheduler;

  beforeEach(() => {
    jest.useFakeTimers();
    engine = new TimeEngine();
    scheduler = new EventScheduler(engine);
  });

  afterEach(() => {
    engine.stop();
    jest.useRealTimers();
  });

  const createEvent = (id: string, second: number, priority: EventPriority = 'Normal', handler: EventHandler = jest.fn()): SimulationEvent => {
    const handlerName = `TestHandler.${id}`;
    EventRegistry.register(handlerName, handler);
    return {
      id,
      name: `Event ${id}`,
      description: 'Test event',
      scheduledTime: { year: 1, month: 1, day: 1, hour: 0, minute: 0, second },
      createdTime: { year: 1, month: 1, day: 1, hour: 0, minute: 0, second: 0 },
      priority,
      status: 'Scheduled',
      sourceModule: 'Test',
      targetModule: 'Test',
      cancelFlag: false,
      retryCount: 0,
      handlerName
    };
  };

  it('should execute events strictly based on simulation time', async () => {
    const handler1 = jest.fn();
    const handler2 = jest.fn();
    
    scheduler.scheduleEvent(createEvent('1', 5, 'Normal', handler1));
    scheduler.scheduleEvent(createEvent('2', 10, 'Normal', handler2));

    engine.start();
    
    // Advance engine strictly by tick calls to match our fake time setup
    engine.tick(); // t=1
    expect(handler1).not.toHaveBeenCalled();

    for (let i = 0; i < 4; i++) engine.tick(); // t=5
    
    // allow microtasks to flush due to async executeDueEvents
    await Promise.resolve();

    expect(handler1).toHaveBeenCalledTimes(1);
    expect(handler2).not.toHaveBeenCalled();

    for (let i = 0; i < 5; i++) engine.tick(); // t=10
    
    const flushPromises = () => new Promise(jest.requireActual('timers').setImmediate);
    await flushPromises();
    await flushPromises();

    expect(handler2).toHaveBeenCalledTimes(1);
  });

  it('should prioritize events at the same time correctly', async () => {
    const executions: string[] = [];
    
    scheduler.scheduleEvent(createEvent('low', 5, 'Low', () => { executions.push('low'); }));
    scheduler.scheduleEvent(createEvent('high', 5, 'High', () => { executions.push('high'); }));
    scheduler.scheduleEvent(createEvent('critical', 5, 'Critical', () => { executions.push('critical'); }));
    scheduler.scheduleEvent(createEvent('normal', 5, 'Normal', () => { executions.push('normal'); }));

    engine.start();
    for (let i = 0; i < 5; i++) engine.tick(); // t=5
    
    const flushPromises = () => new Promise(jest.requireActual('timers').setImmediate);
    await flushPromises();
    await flushPromises();
    await flushPromises();
    await flushPromises();

    expect(executions).toEqual(['critical', 'high', 'normal', 'low']);
  });

  it('should not execute cancelled events', async () => {
    const handler = jest.fn();
    scheduler.scheduleEvent(createEvent('1', 5, 'Normal', handler));
    
    scheduler.cancelEvent('1');

    engine.start();
    for (let i = 0; i < 5; i++) engine.tick(); // t=5
    
    await Promise.resolve();

    expect(handler).not.toHaveBeenCalled();
    const history = scheduler.getExecutedEvents();
    expect(history[0].id).toBe('1');
    expect(history[0].status).toBe('Cancelled');
  });

  it('should automatically reschedule recurring events', async () => {
    const handler = jest.fn();
    const event = createEvent('recur', 5, 'Normal', handler);
    event.recurrence = { interval: 'Hour', count: 3 };
    scheduler.scheduleEvent(event);

    engine.start();
    
    // Reach first occurrence
    for (let i = 0; i < 5; i++) engine.tick(); // t=5
    await Promise.resolve();
    expect(handler).toHaveBeenCalledTimes(1);

    // Should be rescheduled 1 hour later
    const upcoming = scheduler.getUpcomingEvents();
    expect(upcoming.length).toBe(1);
    expect(upcoming[0].id).toBe('recur-rec-1');
    expect(upcoming[0].scheduledTime.hour).toBe(1); // 0 + 1 hour
    expect(upcoming[0].scheduledTime.second).toBe(5);
  });
  it('should support pausing and resuming events', async () => {
    const handler = jest.fn();
    const event = createEvent('1', 5, 'Normal', handler);
    scheduler.scheduleEvent(event);
    
    expect(scheduler.pauseEvent('1')).toBe(true);
    expect(scheduler.getEvent('1')?.status).toBe('Paused');
    expect(scheduler.stats.queuedEvents).toBe(0);

    engine.start();
    for (let i = 0; i < 5; i++) engine.tick();
    await Promise.resolve();

    expect(handler).not.toHaveBeenCalled(); // was paused

    expect(scheduler.resumeEvent('1')).toBe(true);
    expect(scheduler.getEvent('1')?.status).toBe('Scheduled');
    expect(scheduler.stats.queuedEvents).toBe(1);
    
    // It's still scheduled for second 5, but we are already at second 5.
    // The next tick will pick it up immediately.
    engine.tick();
    
    const flushPromises = () => new Promise(jest.requireActual('timers').setImmediate);
    await flushPromises();
    await flushPromises();
    
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('should support updating priority', async () => {
    scheduler.scheduleEvent(createEvent('low', 5, 'Low'));
    scheduler.updateEventPriority('low', 'Critical');
    
    const events = scheduler.getUpcomingEvents();
    expect(events[0].priority).toBe('Critical');
  });

  it('should track stats correctly', async () => {
    scheduler.scheduleEvent(createEvent('1', 5, 'Normal'));
    scheduler.scheduleEvent(createEvent('2', 5, 'Normal'));
    
    expect(scheduler.stats.totalEventsCreated).toBe(2);
    expect(scheduler.stats.queuedEvents).toBe(2);

    engine.start();
    for (let i = 0; i < 5; i++) engine.tick();
    
    const flushPromises = () => new Promise(jest.requireActual('timers').setImmediate);
    await flushPromises();
    await flushPromises();
    await flushPromises();

    expect(scheduler.stats.executedEvents).toBe(2);
    expect(scheduler.stats.queuedEvents).toBe(0);
    expect(scheduler.stats.averageExecutionTime).toBeGreaterThanOrEqual(0);
  });
});
