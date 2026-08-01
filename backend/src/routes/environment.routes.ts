import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { environmentService } from '../services/environment.service';
import { worldService } from '../services/world.service';
import { EnvironmentalState, WeatherType } from '@genesis/shared';

export const environmentRoutes: FastifyPluginAsync = async (server: FastifyInstance) => {
  const engine = environmentService.engine;

  // GET /environment
  server.get('/environment', async (_request, _reply) => {
    return {
      season: engine.seasonManager.getCurrentSeason(),
      dayPhase: engine.dayCycleManager.getCurrentPhase(),
    };
  });

  // GET /environment/regions
  server.get('/environment/regions', async (_request, _reply) => {
    const regions = worldService.engine.regionManager.getAllRegions();
    const result: Record<string, EnvironmentalState | null> = {};
    for (const r of regions) {
      result[r.id] = engine.getEnvironmentalState(r.id);
    }
    return { regions: result };
  });

  // GET /environment/weather
  server.get('/environment/weather', async (_request, _reply) => {
    const weatherList = engine.weatherManager.getAllWeather();
    return { weather: weatherList };
  });

  // GET /environment/climate
  server.get('/environment/climate', async (_request, _reply) => {
    const profiles = engine.climateManager.getAllProfiles();
    return { profiles };
  });

  // GET /environment/season
  server.get('/environment/season', async (_request, _reply) => {
    return { season: engine.seasonManager.getCurrentSeason() };
  });

  // GET /environment/day-cycle
  server.get('/environment/day-cycle', async (_request, _reply) => {
    return { dayPhase: engine.dayCycleManager.getCurrentPhase() };
  });

  // GET /environment/statistics
  server.get('/environment/statistics', async (_request, _reply) => {
    const weatherList = engine.weatherManager.getAllWeather();
    const typeCounts: Record<string, number> = {};
    for (const w of weatherList) {
      typeCounts[w.currentType] = (typeCounts[w.currentType] || 0) + 1;
    }

    const regions = worldService.engine.regionManager.getAllRegions();
    let tempSum = 0;
    let humSum = 0;
    let count = 0;

    for (const r of regions) {
      const state = engine.getEnvironmentalState(r.id);
      if (state) {
        tempSum += state.temperature;
        humSum += state.humidity;
        count++;
      }
    }

    return {
      regionsCount: regions.length,
      weatherDistribution: typeCounts,
      averageTemperature: count > 0 ? Number((tempSum / count).toFixed(1)) : 0,
      averageHumidity: count > 0 ? Number((humSum / count).toFixed(1)) : 0,
      currentSeason: engine.seasonManager.getCurrentSeason(),
      currentPhase: engine.dayCycleManager.getCurrentPhase()
    };
  });

  // POST /environment/weather
  // Endpoint to manually force a weather change for testing
  server.post('/environment/weather', async (request, reply) => {
    const { regionId, weatherType } = request.body as { regionId: string, weatherType: string };
    
    if (!regionId || !weatherType) {
      return reply.status(400).send({ error: 'Missing regionId or weatherType' });
    }

    const weather = engine.weatherManager.getRegionWeather(regionId);
    if (weather) {
      weather.currentType = weatherType as WeatherType;
      weather.timeInCurrentWeather = 0;
      return { success: true, weather };
    }

    return reply.status(404).send({ error: 'Region weather not found' });
  });
};
