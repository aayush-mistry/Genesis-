import { EventScheduler } from '@genesis/engine';
import { timeService } from './time.service';
import { eventRepository } from '../repositories/EventRepository';

class EventService {
  private static instance: EventService;
  public scheduler: EventScheduler;

  private constructor() {
    this.scheduler = new EventScheduler(timeService.engine, eventRepository);
  }

  public static getInstance(): EventService {
    if (!EventService.instance) {
      EventService.instance = new EventService();
    }
    return EventService.instance;
  }
}

export const eventService = EventService.getInstance();
