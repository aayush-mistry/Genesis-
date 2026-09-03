import { prisma } from './prisma';
import { SimulationEvent as PrismaSimulationEvent } from '@prisma/client';
import { SimulationEvent, SimulationTime, EventStatus, EventPriority } from '@genesis/engine';

export class EventRepository {
  /**
   * Converts a memory SimulationEvent to Prisma data structure
   */
  private toPrismaEvent(event: SimulationEvent): Omit<PrismaSimulationEvent, 'createdAt' | 'updatedAt'> {
    return {
      id: event.id,
      name: event.name,
      description: event.description,
      priority: event.priority,
      status: event.status,
      
      scheduledTimeJson: JSON.stringify(event.scheduledTime),
      createdTimeJson: JSON.stringify(event.createdTime),
      executionTimeJson: event.executionTime ? JSON.stringify(event.executionTime) : null,
      completionTimeJson: event.completionTime ? JSON.stringify(event.completionTime) : null,
      
      handlerName: event.handlerName,
      metadataJson: event.metadata ? JSON.stringify(event.metadata) : null,
      tagsJson: event.tags ? JSON.stringify(event.tags) : null,
      
      sourceModule: event.sourceModule,
      targetModule: event.targetModule,
      
      recurrenceInterval: event.recurrence?.interval || null,
      recurrenceCount: event.recurrenceCount ?? null,
      
      cancelFlag: event.cancelFlag,
      retryCount: event.retryCount,
      executionResultJson: event.executionResult !== undefined ? JSON.stringify(event.executionResult) : null,
      
      executionDurationMs: event.executionDurationMs ?? null,
    };
  }

  /**
   * Converts a Prisma database record to memory SimulationEvent
   */
  private fromPrismaEvent(record: PrismaSimulationEvent): SimulationEvent {
    return {
      id: record.id,
      name: record.name,
      description: record.description,
      priority: record.priority as EventPriority,
      status: record.status as EventStatus,
      
      scheduledTime: JSON.parse(record.scheduledTimeJson) as SimulationTime,
      createdTime: JSON.parse(record.createdTimeJson) as SimulationTime,
      executionTime: record.executionTimeJson ? JSON.parse(record.executionTimeJson) as SimulationTime : undefined,
      completionTime: record.completionTimeJson ? JSON.parse(record.completionTimeJson) as SimulationTime : undefined,
      
      handlerName: record.handlerName,
      metadata: record.metadataJson ? JSON.parse(record.metadataJson) : undefined,
      tags: record.tagsJson ? JSON.parse(record.tagsJson) : undefined,
      
      sourceModule: record.sourceModule,
      targetModule: record.targetModule,
      
      recurrence: record.recurrenceInterval ? {
        interval: record.recurrenceInterval as any,
        count: record.recurrenceCount !== null ? record.recurrenceCount : undefined,
      } : undefined,
      recurrenceCount: record.recurrenceCount !== null ? record.recurrenceCount : undefined,
      
      cancelFlag: record.cancelFlag,
      retryCount: record.retryCount,
      executionResult: record.executionResultJson ? JSON.parse(record.executionResultJson) : undefined,
      
      executionDurationMs: record.executionDurationMs !== null ? record.executionDurationMs : undefined,
      
      stateTransitions: [],
    };
  }

  async createEvent(event: SimulationEvent): Promise<void> {
    const data = this.toPrismaEvent(event);
    await prisma.simulationEvent.upsert({
      where: { id: event.id },
      update: data,
      create: data
    });
  }

  async updateEvent(event: SimulationEvent): Promise<void> {
    const data = this.toPrismaEvent(event);
    await prisma.simulationEvent.update({
      where: { id: event.id },
      data
    });
  }

  async updateEventStatus(id: string, status: EventStatus, cancelFlag?: boolean, executionDurationMs?: number): Promise<void> {
    const data: any = { status };
    if (cancelFlag !== undefined) data.cancelFlag = cancelFlag;
    if (executionDurationMs !== undefined) data.executionDurationMs = executionDurationMs;
    
    await prisma.simulationEvent.update({
      where: { id },
      data
    });
  }

  async getPendingEvents(): Promise<SimulationEvent[]> {
    const records = await prisma.simulationEvent.findMany({
      where: {
        status: {
          in: ['Scheduled', 'Waiting', 'Paused']
        }
      }
    });
    
    return records.map(r => this.fromPrismaEvent(r));
  }
}

export const eventRepository = new EventRepository();
