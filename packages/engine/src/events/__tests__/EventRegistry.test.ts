import { EventRegistry } from '../EventRegistry';
import { SimulationEvent } from '../SimulationEvent';

describe('EventRegistry', () => {
  beforeEach(() => {
    EventRegistry.clear();
  });

  afterEach(() => {
    EventRegistry.clear();
  });

  it('should register and resolve a handler', () => {
    const handler = async (event: SimulationEvent) => {};
    EventRegistry.register('Test.Handler', handler);
    const resolved = EventRegistry.resolve('Test.Handler');
    expect(resolved).toBe(handler);
  });

  it('should throw when resolving an unregistered handler', () => {
    expect(() => EventRegistry.resolve('Unknown')).toThrow("EventRegistry: No handler registered for 'Unknown'.");
  });

  it('should warn when overwriting a handler', () => {
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const handler1 = async (event: SimulationEvent) => {};
    const handler2 = async (event: SimulationEvent) => {};

    EventRegistry.register('Duplicate.Handler', handler1);
    EventRegistry.register('Duplicate.Handler', handler2);

    expect(consoleWarnSpy).toHaveBeenCalledWith("EventRegistry: Handler 'Duplicate.Handler' is already registered. Overwriting.");
    const resolved = EventRegistry.resolve('Duplicate.Handler');
    expect(resolved).toBe(handler2);

    consoleWarnSpy.mockRestore();
  });

  it('should clear all handlers except Global.NoOp', () => {
    EventRegistry.register('Test.Handler', async (event: SimulationEvent) => {});
    EventRegistry.clear();
    
    expect(EventRegistry.getRegisteredHandlers()).toContain('Global.NoOp');
    expect(EventRegistry.getRegisteredHandlers()).not.toContain('Test.Handler');
  });
});
