import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { timeService } from '../services/time.service';
import { worldService } from '../services/world.service';
import { citizenService } from '../services/citizen.service';
import { spatialService } from '../services/spatial.service';
import { eventService } from '../services/event.service';
import { TimeUtils } from '@genesis/engine';

export const liveRoutes: FastifyPluginAsync = async (server: FastifyInstance) => {
  server.get('/simulation/live', (request, reply) => {
    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.flushHeaders();

    const sendUpdate = async (time: any) => {
      const world = worldService.engine.worldManager.getWorld();
      if (!world) {
        reply.raw.write(`data: ${JSON.stringify({ error: 'World not initialized' })}\n\n`);
        return;
      }

      // Generate dynamic spatial data
      const citizens = citizenService.engine.listCitizens();
      const clusterMap = new Map<string, any>();
      
      const mappedCitizens = citizens.map(citizen => {
        let x = citizen.coordX ?? 0;
        let y = citizen.coordY ?? 0;
        let destinationX: number | undefined = undefined;
        let destinationY: number | undefined = undefined;
        let travelProgress: number | undefined = undefined;

        const exactCoords = spatialService.engine.queryService.resolveCitizenLocation(citizen, time);
        if (exactCoords) {
          x = exactCoords.x;
          y = exactCoords.y;
        }

        if (citizen.movementState === 'TRAVELLING' && citizen.activeRoute) {
          const route = citizen.activeRoute;
          const destCoords = spatialService.engine.queryService['worldEngine'].getEntityCoordinates(route.destinationId);
          if (destCoords) {
            destinationX = destCoords.x;
            destinationY = destCoords.y;
          }
          const startSecs = TimeUtils.toSeconds(route.startedAtSimulationTime);
          const expectedSecs = TimeUtils.toSeconds(route.expectedArrivalSimulationTime);
          const currentSecs = TimeUtils.toSeconds(time);
          if (expectedSecs > startSecs) {
            travelProgress = Math.min(1, Math.max(0, (currentSecs - startSecs) / (expectedSecs - startSecs)));
          } else {
            travelProgress = 1;
          }
        }

        const locId = citizen.locationId || 'unknown';
        if (!clusterMap.has(locId)) {
          clusterMap.set(locId, {
            clusterId: `cluster-${locId}`,
            x: x, // Approximate
            y: y,
            population: 0
          });
        }
        clusterMap.get(locId).population++;

        return {
          id: citizen.id,
          householdId: citizen.householdId,
          workplaceId: citizen.workplaceId,
          x,
          y,
          locationId: citizen.locationId,
          movementState: citizen.movementState,
          activeRoute: citizen.activeRoute,
          destinationX,
          destinationY,
          travelProgress
        };
      });

      const recentEvents = eventService.scheduler.getExecutedEvents().slice(0, 10);

      const payload = {
        tickId: timeService.engine.currentTick,
        time: time,
        state: timeService.engine.getState(),
        speed: timeService.engine.getSpeed(),
        dynamicData: {
          citizens: mappedCitizens,
          populationClusters: Array.from(clusterMap.values()),
          events: recentEvents
        }
      };

      reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    // Send initial state immediately
    sendUpdate(timeService.engine.getCurrentTime());

    // Subscribe to time engine ticks
    const subscriber = (time: any) => {
      sendUpdate(time);
    };

    timeService.engine.subscribe(subscriber);

    request.raw.on('close', () => {
      timeService.engine.unsubscribe(subscriber);
    });
  });
};
