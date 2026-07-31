import Fastify from 'fastify';

import { logger } from './utils/logger';
import { healthRoutes } from './routes/health.routes';
import { errorHandler } from './middleware/errorHandler';

export async function buildApp() {
  const app = Fastify({
    logger: logger as any
  });

  app.setErrorHandler((error, request, reply) => errorHandler(error, request, reply));

  // Register routes
  app.register(healthRoutes, { prefix: '/api/v1' });

  return app;
}
