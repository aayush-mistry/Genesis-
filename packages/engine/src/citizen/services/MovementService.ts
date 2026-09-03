import { Citizen, MovementState, Route, SimulationTime } from '@genesis/shared';
import { CitizenRepository } from '../repositories/CitizenRepository';
import { SpatialQueryService } from '../../spatial/SpatialQueryService';
import { EventScheduler } from '../../events/EventScheduler';
import { TimeEngine } from '../../time/TimeEngine';
import { TimeUtils } from '../../utils/TimeUtils';
import { randomUUID } from 'crypto';

import { EventRegistry } from '../../events/EventRegistry';

export class MovementService {
  private repository: CitizenRepository;
  private spatialQueryService: SpatialQueryService;
  private eventScheduler: EventScheduler;
  private timeEngine: TimeEngine;
  
  // Baseline travel speed: distance units per simulation hour.
  public static readonly TRAVEL_SPEED_UNITS_PER_HOUR = 50;

  constructor(
    repository: CitizenRepository, 
    spatialQueryService: SpatialQueryService,
    eventScheduler: EventScheduler,
    timeEngine: TimeEngine
  ) {
    this.repository = repository;
    this.spatialQueryService = spatialQueryService;
    this.eventScheduler = eventScheduler;
    this.timeEngine = timeEngine;
    
    EventRegistry.register('MovementService.handleArrival', async (event) => {
      this.handleArrival(event.id, event.metadata as { citizenId: string, destinationId: string, routeId: string });
    });
  }

  public requestMovement(citizenId: string, destinationId: string): Route {
    const citizen = this.repository.findById(citizenId);
    if (!citizen) {
      throw new Error(`Movement request failed: Citizen ${citizenId} not found.`);
    }

    if (citizen.movementState === MovementState.TRAVELLING) {
      throw new Error(`Movement request failed: Citizen ${citizenId} is already travelling.`);
    }

    const sourceId = citizen.locationId;
    if (!sourceId) {
      throw new Error(`Movement request failed: Citizen ${citizenId} has no current location.`);
    }

    if (sourceId === destinationId) {
      // Source == Destination, valid no-op.
      // We can just return a completed route immediately.
      const now = this.timeEngine.getCurrentTime();
      const route: Route = {
        id: randomUUID(),
        sourceId,
        destinationId,
        path: [sourceId, destinationId],
        status: 'COMPLETED',
        createdAtSimulationTime: TimeUtils.clone(now),
        startedAtSimulationTime: TimeUtils.clone(now),
        expectedArrivalSimulationTime: TimeUtils.clone(now),
        estimatedTravelDurationHours: 0
      };
      citizen.movementState = MovementState.IDLE;
      citizen.activeRoute = null;
      this.repository.update(citizen);
      return route;
    }

    // Determine path and distance
    const { path, distance } = this.spatialQueryService.calculateRoute(sourceId, destinationId);

    // Calculate duration in simulation hours
    const estimatedTravelDurationHours = distance / MovementService.TRAVEL_SPEED_UNITS_PER_HOUR;
    const durationSeconds = estimatedTravelDurationHours * 3600;

    const currentTime = this.timeEngine.getCurrentTime();
    const currentSeconds = TimeUtils.toSeconds(currentTime);
    const arrivalSeconds = Math.round(currentSeconds + durationSeconds);
    const expectedArrivalSimulationTime = TimeUtils.fromSeconds(arrivalSeconds);

    const route: Route = {
      id: randomUUID(),
      sourceId,
      destinationId,
      path,
      status: 'ACTIVE',
      createdAtSimulationTime: TimeUtils.clone(currentTime),
      startedAtSimulationTime: TimeUtils.clone(currentTime),
      expectedArrivalSimulationTime: TimeUtils.clone(expectedArrivalSimulationTime),
      estimatedTravelDurationHours
    };

    citizen.movementState = MovementState.TRAVELLING;
    citizen.activeRoute = route;
    this.repository.update(citizen);

    // Schedule arrival event
    this.eventScheduler.scheduleEvent({
      id: `arrival-${route.id}`,
      name: 'Citizen Arrival',
      description: `Citizen ${citizenId} arrives at ${destinationId}`,
      priority: 'Normal',
      status: 'Scheduled',
      createdTime: TimeUtils.clone(currentTime),
      scheduledTime: expectedArrivalSimulationTime,
      sourceModule: 'MovementEngine',
      targetModule: 'CitizenEngine',
      cancelFlag: false,
      retryCount: 0,
      metadata: {
        citizenId,
        destinationId,
        routeId: route.id
      },
      handlerName: 'MovementService.handleArrival'
    });

    return route;
  }

  public handleArrival(eventId: string, metadata: { citizenId: string, destinationId: string, routeId: string }): void {
    const { citizenId, destinationId, routeId } = metadata;
    const citizen = this.repository.findById(citizenId);
    
    if (!citizen) return; // Citizen deleted before arrival
    if (citizen.movementState !== MovementState.TRAVELLING) return; // Not travelling anymore
    if (!citizen.activeRoute || citizen.activeRoute.id !== routeId) return; // Route changed or cancelled

    // Process arrival
    citizen.locationId = destinationId;
    citizen.movementState = MovementState.IDLE;
    if (citizen.activeRoute) {
      citizen.activeRoute.status = 'COMPLETED';
    }
    // We clear the activeRoute to denote they are completely IDLE and arrived.
    // In a full persistence system we might save the history, but here we just clear it from current state.
    citizen.activeRoute = null;

    this.repository.update(citizen);
  }

  public cancelMovement(citizenId: string): void {
    const citizen = this.repository.findById(citizenId);
    if (!citizen) {
      throw new Error(`Movement cancellation failed: Citizen ${citizenId} not found.`);
    }

    if (citizen.movementState !== MovementState.TRAVELLING || !citizen.activeRoute) {
      return; // Nothing to cancel
    }

    // Find the event and cancel it
    const eventId = `arrival-${citizen.activeRoute.id}`;
    const event = this.eventScheduler.getEvent(eventId);
    if (event) {
      event.cancelFlag = true;
    }

    // Revert state
    citizen.activeRoute.status = 'CANCELLED';
    citizen.movementState = MovementState.IDLE;
    citizen.activeRoute = null; // Cleared

    this.repository.update(citizen);
  }
}
