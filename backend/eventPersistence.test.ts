import { prisma } from './src/repositories/prisma';
import { persistenceService } from './src/services/persistence.service';
import { eventRepository } from './src/repositories/EventRepository';
import { eventService } from './src/services/event.service';
import { SimulationEvent, EventRegistry } from '@genesis/engine';

async function runEventPersistenceTest() {
  console.log('--- BEGIN EVENT PERSISTENCE TEST ---');
  
  // Clean up
  await prisma.simulationEvent.deleteMany();
  await prisma.simulationState.deleteMany();

  console.log('1. Setting up initial persisted event...');
  
  await prisma.simulationState.create({
    data: { id: 'singleton', year: 1, month: 2, day: 15, speed: 1 }
  });

  const event: SimulationEvent = {
    id: 'test-event-1',
    name: 'Test Persistent Event',
    description: 'Verifies SQLite hydration',
    priority: 'Normal',
    status: 'Scheduled',
    scheduledTime: { year: 1, month: 1, day: 1, hour: 12, minute: 0, second: 0 },
    createdTime: { year: 1, month: 1, day: 1, hour: 0, minute: 0, second: 0 },
    handlerName: 'TestEngine.dummyAction',
    sourceModule: 'TestModule',
    targetModule: 'TestModule',
    cancelFlag: false,
    retryCount: 0
  };

  let executionCount = 0;
  EventRegistry.register('TestEngine.dummyAction', async () => {
    executionCount++;
  });

  await eventRepository.createEvent(event);

  console.log('2. Starting Backend Bootstrap (Hydration)...');
  await persistenceService.bootstrap();
  
  console.log('\n--- VERIFYING EXACT VALUES ---');
  
  const queuedEvent = eventService.scheduler.getEvent('test-event-1');
  console.log(`Event in Scheduler: ${queuedEvent ? 'YES' : 'NO'} (Expected: YES)`);
  if (!queuedEvent) throw new Error("Event was not hydrated into EventScheduler!");

  console.log(`Event Status: ${queuedEvent.status} (Expected: Scheduled)`);
  if (queuedEvent.status !== 'Scheduled') throw new Error("Event status is incorrect!");

  console.log('3. Advancing time to trigger execution...');
  
  // Advance the engine by 12 hours to reach 12:00:00
  eventService.scheduler['engine']!.advance(12 * 3600);
  
  // Directly execute due events to await it properly
  const currentTime = eventService.scheduler['engine']!.getCurrentTime();
  console.log(`Current Time:`, currentTime);
  console.log(`Scheduled Time:`, eventService.scheduler.getEvent('test-event-1')?.scheduledTime);
  await eventService.scheduler.executeDueEvents(currentTime);
  
  // Allow promises to flush
  await new Promise(r => setTimeout(r, 100));
  
  console.log(`Execution Count: ${executionCount} (Expected: 1)`);
  if (executionCount !== 1) throw new Error("Event was not executed exactly once!");

  const postEvent = await prisma.simulationEvent.findUnique({ where: { id: 'test-event-1' } });
  console.log(`Event DB Status: ${postEvent?.status} (Expected: Completed)`);
  if (postEvent?.status !== 'Completed') throw new Error("Event DB status was not updated to Completed!");

  console.log('--- EVENT PERSISTENCE TEST PASSED ---');
}

runEventPersistenceTest().catch(console.error).finally(() => prisma.$disconnect());
