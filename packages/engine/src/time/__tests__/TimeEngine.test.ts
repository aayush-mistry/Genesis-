import { TimeEngine } from '../TimeEngine';


describe('TimeEngine', () => {
  let engine: TimeEngine;

  beforeEach(() => {
    jest.useFakeTimers();
    engine = new TimeEngine();
  });

  afterEach(() => {
    engine.stop();
    jest.useRealTimers();
  });

  it('should initialize with default time and Stopped state', () => {
    const time = engine.getCurrentTime();
    expect(time).toEqual({
      year: 1, month: 1, day: 1, hour: 0, minute: 0, second: 0
    });
    expect(engine.getState()).toBe('Stopped');
    expect(engine.getSpeed()).toBe(1);
  });

  it('should advance time when tick() is called manually', () => {
    engine.start();
    engine.tick(); // advances by 1 second (default speed)
    expect(engine.getCurrentTime().second).toBe(1);
  });

  it('should NOT advance time if tick() is called while not running', () => {
    engine.tick();
    expect(engine.getCurrentTime().second).toBe(0);
  });

  it('should notify subscribers on tick', () => {
    const subscriber = jest.fn();
    engine.subscribe(subscriber);
    engine.start();
    engine.tick();
    expect(subscriber).toHaveBeenCalledTimes(1);
    expect(subscriber).toHaveBeenCalledWith(engine.getCurrentTime());
  });

  it('should start and run interval based on fake timers', () => {
    engine.start();
    expect(engine.getState()).toBe('Running');
    jest.advanceTimersByTime(2000); // 2 seconds
    expect(engine.getCurrentTime().second).toBe(2);
  });

  it('should pause and stop interval', () => {
    engine.start();
    jest.advanceTimersByTime(1000); // 1 tick
    engine.pause();
    expect(engine.getState()).toBe('Paused');
    jest.advanceTimersByTime(2000); // should not tick
    expect(engine.getCurrentTime().second).toBe(1);
  });

  it('should resume from paused state', () => {
    engine.start();
    engine.pause();
    engine.resume();
    expect(engine.getState()).toBe('Running');
    jest.advanceTimersByTime(1000); // 1 tick
    expect(engine.getCurrentTime().second).toBe(1);
  });

  it('should reset time and state', () => {
    engine.start();
    jest.advanceTimersByTime(5000); // 5 seconds
    engine.reset();
    expect(engine.getState()).toBe('Reset');
    expect(engine.getCurrentTime()).toEqual({
      year: 1, month: 1, day: 1, hour: 0, minute: 0, second: 0
    });
  });

  it('should apply speed multiplier correctly', () => {
    engine.start();
    engine.setSpeed(60); // 1 tick = 60 seconds (1 minute)
    engine.tick();
    expect(engine.getCurrentTime().minute).toBe(1);
    expect(engine.getCurrentTime().second).toBe(0);
  });

  it('should advance days, months, and years correctly', () => {
    engine.start();
    engine.setSpeed(60 * 60 * 24 * 30); // 1 month per tick
    engine.tick();
    const time = engine.getCurrentTime();
    expect(time.month).toBe(2);
    expect(time.year).toBe(1);
    
    // advance 11 more months
    engine.setSpeed(60 * 60 * 24 * 30 * 11);
    engine.tick();
    const finalTime = engine.getCurrentTime();
    expect(finalTime.year).toBe(2);
    expect(finalTime.month).toBe(1);
  });
});
