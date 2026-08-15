import { FastifyRequest, FastifyReply } from 'fastify';
import * as crypto from 'crypto';
import { timeService } from '../services/time.service';
import { eventService } from '../services/event.service';
import { worldService } from '../services/world.service';
import { environmentService } from '../services/environment.service';
import { resourceService } from '../services/resource.service';
import { spatialService } from '../services/spatial.service';
import { citizenService } from '../services/citizen.service';

export class SystemController {
  public static async getStatus(_req: FastifyRequest, reply: FastifyReply) {
    const timeState = timeService.engine.getState();
    const eventStats = eventService.scheduler.stats;
    const world = worldService.engine.worldManager.getWorld();
    const spatialStats = spatialService.engine.index.getStatistics();
    const citizens = citizenService.engine.listCitizens();

    return reply.send({
      engines: {
        time: {
          status: timeState === 'Running' ? 'Running' : timeState === 'Paused' ? 'Paused' : 'Stopped',
          details: `Uptime: ${timeService.engine.getUptimeSeconds()}s | TPS: ${timeService.engine.ticksPerSecond}`
        },
        event: {
          status: 'Running', // The scheduler itself is always active/polling
          details: `Queue: ${eventService.scheduler.getUpcomingEvents().length} | Executed: ${eventStats.executedEvents}`
        },
        world: {
          status: world ? 'Running' : 'Ready',
          details: world ? `Regions: ${worldService.engine.regionManager.getAllRegions().length}` : 'Uninitialized'
        },
        environment: {
          status: world ? 'Running' : 'Ready',
          details: `Weather instances: ${environmentService.engine.weatherManager.getAllWeather().length}`
        },
        resource: {
          status: world ? 'Running' : 'Ready',
          details: `Tracked resources: ${resourceService.engine.resourceManager.getAllResources().length}`
        },
        spatial: {
          status: world ? 'Running' : 'Ready',
          details: `Indexed entities: ${spatialStats.indexedEntities}`
        },
        citizen: {
          status: 'Running',
          details: `Total Citizens: ${citizens.length}`
        }
      }
    });
  }


  public static async getVerification(_req: FastifyRequest, reply: FastifyReply) {
    const world = worldService.engine.worldManager.getWorld();
    
    if (!world) {
      return reply.status(404).send({ error: 'World not initialized' });
    }

    // Build deterministic data payload
    const regions = worldService.engine.regionManager.getAllRegions();
    const cities = worldService.engine.cityManager.getAllCities();
    const districts = worldService.engine.districtManager.getAllDistricts();
    const buildings = worldService.engine.buildingManager.getAllBuildings();
    const resources = resourceService.engine.resourceManager.getAllResources();
    const profiles = environmentService.engine.climateManager.getAllProfiles();

    const citizens = citizenService.engine.listCitizens();

    // The hash MUST depend on deterministic structure, counts, and seed, NOT timestamps or memory addresses.
    const payload = JSON.stringify({
      seed: world.randomSeed,
      counts: {
        regions: regions.length,
        cities: cities.length,
        districts: districts.length,
        buildings: buildings.length,
        resources: resources.length,
        climateProfiles: profiles.length,
        citizens: citizens.length
      },
      // Hashing the sorted IDs (deterministic) ensures the generation structure is identical
      regionIds: regions.map(r => r.id).sort(),
      cityIds: cities.map(c => c.id).sort(),
      districtIds: districts.map(d => d.id).sort(),
      buildingIds: buildings.map(b => b.id).sort(),
      resourceIds: resources.map(r => r.id).sort(),
      citizenIds: citizens.map(c => c.id).sort()
    });

    const hash = crypto.createHash('sha256').update(payload).digest('hex');

    return reply.send({
      seed: world.randomSeed,
      hash,
      status: 'Generated',
      counts: {
        regions: regions.length,
        resources: resources.length,
        environmentProfiles: profiles.length,
        citizens: citizens.length
      }
    });
  }
}
