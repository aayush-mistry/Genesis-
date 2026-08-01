import Fastify from 'fastify';


import { healthRoutes } from './routes/health.routes';
import { errorHandler } from './middleware/errorHandler';

import { timeRoutes } from './routes/time.routes';
import { eventRoutes } from './routes/event.routes';
import { worldRoutes } from './routes/world.routes';

export async function buildApp() {
  const app = Fastify({
    logger: true
  });

  app.setErrorHandler((error, request, reply) => errorHandler(error, request, reply));

  app.register(healthRoutes, { prefix: '/api/v1' });
  app.register(timeRoutes, { prefix: '/api/v1' });
  app.register(eventRoutes, { prefix: '/api/v1' });
  app.register(worldRoutes, { prefix: '/api/v1' });

  return app;
}

