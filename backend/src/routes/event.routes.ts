import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { eventService } from '../services/event.service';
import { timeService } from '../services/time.service';
import { SimulationEvent, TimeUtils } from '@genesis/engine';
import { v4 as uuidv4 } from 'uuid';

export const eventRoutes: FastifyPluginAsync = async (server: FastifyInstance) => {
  const scheduler = eventService.scheduler;
  const engine = timeService.engine;

  server.get('/events', async (request, reply) => {
    return {
      upcoming: scheduler.getUpcomingEvents(),
      history: scheduler.getExecutedEvents(),
      queueSize: scheduler.getUpcomingEvents().length
    };
  });

  server.get('/events/upcoming', async (request, reply) => {
    return {
      upcoming: scheduler.getUpcomingEvents(),
      queueSize: scheduler.getUpcomingEvents().length
    };
  });

  server.get('/events/history', async (request, reply) => {
    const query = request.query as any;
    let history = scheduler.getExecutedEvents();
    
    if (query.status) {
      history = history.filter(e => e.status === query.status);
    }
    if (query.search) {
      const search = query.search.toLowerCase();
      history = history.filter(e => e.name.toLowerCase().includes(search) || e.id.toLowerCase().includes(search));
    }
    if (query.module) {
      history = history.filter(e => e.sourceModule === query.module || e.targetModule === query.module);
    }
    if (query.limit) {
      history = history.slice(0, parseInt(query.limit, 10));
    }

    return { history };
  });

  server.get('/events/stats', async (request, reply) => {
    return {
      stats: scheduler.stats,
      performance: scheduler.performance
    };
  });

  server.get('/events/logs', async (request, reply) => {
    return {
      logs: scheduler.getLogs()
    };
  });

  server.post('/events/clear', async (request, reply) => {
    scheduler.clearEvents();
    return { success: true };
  });

  server.put('/events/:id/cancel', async (request, reply) => {
    const { id } = request.params as { id: string };
    const success = scheduler.cancelEvent(id);
    if (!success) {
      return reply.status(404).send({ error: 'Event not found or already executed' });
    }
    return { success: true };
  });

  server.put('/events/:id/pause', async (request, reply) => {
    const { id } = request.params as { id: string };
    const success = scheduler.pauseEvent(id);
    if (!success) return reply.status(404).send({ error: 'Event not found' });
    return { success: true };
  });

  server.put('/events/:id/resume', async (request, reply) => {
    const { id } = request.params as { id: string };
    const success = scheduler.resumeEvent(id);
    if (!success) return reply.status(404).send({ error: 'Event not found or not paused' });
    return { success: true };
  });

  server.put('/events/:id/priority', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { priority } = request.body as any;
    const success = scheduler.updateEventPriority(id, priority);
    if (!success) return reply.status(404).send({ error: 'Event not found' });
    return { success: true };
  });

  server.post('/events/:id/duplicate', async (request, reply) => {
    const { id } = request.params as { id: string };
    const event = scheduler.getEvent(id);
    if (!event) return reply.status(404).send({ error: 'Event not found' });

    const newEvent: SimulationEvent = {
      ...event,
      id: uuidv4(),
      name: `${event.name} (Copy)`,
      status: 'Scheduled',
      createdTime: engine.getCurrentTime(),
      executionTime: undefined,
      completionTime: undefined,
      executionResult: undefined,
      stateTransitions: []
    };
    
    scheduler.scheduleEvent(newEvent);
    return { success: true, event: newEvent };
  });

  // Event Injection Panel support
  server.post('/events', async (request, reply) => {
    const { 
      name, description, delaySeconds = 10, recurrenceInterval,
      priority = 'Normal', targetModule = 'System', tags = [], metadata = {}
    } = request.body as any;

    const currentTime = engine.getCurrentTime();
    
    const scheduledTime = TimeUtils.clone(currentTime);
    scheduledTime.second += parseInt(delaySeconds, 10);
    
    while (scheduledTime.second >= 60) {
      scheduledTime.second -= 60;
      scheduledTime.minute += 1;
    }
    while (scheduledTime.minute >= 60) {
      scheduledTime.minute -= 60;
      scheduledTime.hour += 1;
    }
    while (scheduledTime.hour >= 24) {
      scheduledTime.hour -= 24;
      scheduledTime.day += 1;
    }
    while (scheduledTime.day > 30) {
      scheduledTime.day -= 30;
      scheduledTime.month += 1;
    }
    while (scheduledTime.month > 12) {
      scheduledTime.month -= 12;
      scheduledTime.year += 1;
    }

    const event: SimulationEvent = {
      id: uuidv4(),
      name: name || 'Test Event',
      description: description || 'A generated test event',
      scheduledTime,
      createdTime: currentTime,
      priority,
      status: 'Scheduled',
      cancelFlag: false,
      retryCount: 0,
      sourceModule: 'API',
      targetModule,
      tags,
      metadata,
      handler: async (e: SimulationEvent) => {
        // Sleep to simulate work
        await new Promise(r => setTimeout(r, Math.random() * 50));
        console.log(`[Event Executed] ${e.name}`);
      }
    };

    if (recurrenceInterval) {
      event.recurrence = { interval: recurrenceInterval };
    }

    scheduler.scheduleEvent(event);
    return { success: true, event };
  });
};
