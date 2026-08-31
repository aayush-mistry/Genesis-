import { SimulationEvent, EventHandler } from './SimulationEvent';

export class EventRegistry {
  private static handlers: Map<string, EventHandler> = new Map();

  public static register(handlerName: string, handler: EventHandler): void {
    if (this.handlers.has(handlerName)) {
      console.warn(`EventRegistry: Handler '${handlerName}' is already registered. Overwriting.`);
    }
    this.handlers.set(handlerName, handler);
  }

  public static resolve(handlerName: string): EventHandler {
    const handler = this.handlers.get(handlerName);
    if (!handler) {
      throw new Error(`EventRegistry: No handler registered for '${handlerName}'.`);
    }
    return handler;
  }

  public static getRegisteredHandlers(): string[] {
    return Array.from(this.handlers.keys());
  }
}
