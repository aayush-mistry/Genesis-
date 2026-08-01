import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { timeService } from '../services/time.service';

export const timeRoutes: FastifyPluginAsync = async (server: FastifyInstance) => {
  const engine = timeService.engine;

  server.get('/time', async (_request, _reply) => {
    return {
      time: engine.getCurrentTime(),
      state: engine.getState(),
      speed: engine.getSpeed(),
      ticksPerSecond: engine.ticksPerSecond,
      lastTickDurationMs: engine.lastTickDurationMs,
      uptime: engine.getUptimeSeconds()
    };
  });

  server.post('/time/start', async (_request, _reply) => {
    engine.start();
    return { success: true, state: engine.getState() };
  });

  server.post('/time/pause', async (_request, _reply) => {
    engine.pause();
    return { success: true, state: engine.getState() };
  });

  server.post('/time/resume', async (_request, _reply) => {
    engine.resume();
    return { success: true, state: engine.getState() };
  });

  server.post('/time/reset', async (_request, _reply) => {
    engine.reset();
    return { success: true, state: engine.getState(), time: engine.getCurrentTime() };
  });

  server.post('/time/speed', async (request, reply) => {
    const { speed } = request.body as { speed: number };
    if (typeof speed !== 'number' || speed <= 0) {
      return reply.status(400).send({ error: 'Invalid speed value. Must be a positive number.' });
    }
    engine.setSpeed(speed);
    return { success: true, speed: engine.getSpeed() };
  });
};
