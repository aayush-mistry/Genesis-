import Fastify from 'fastify';


import { healthRoutes } from './routes/health.routes';
import { errorHandler } from './middleware/errorHandler';

import { timeRoutes } from './routes/time.routes';
import { eventRoutes } from './routes/event.routes';
import { worldRoutes } from './routes/world.routes';
import { environmentRoutes } from './routes/environment.routes';
import { resourceRoutes } from './routes/resource.routes';
import { spatialRoutes } from './routes/spatial.routes';
import { systemRoutes } from './routes/system.routes';
import { citizenRoutes } from './routes/citizen.routes';


export async function buildApp() {
  const app = Fastify({
    logger: true
  });

  app.setErrorHandler((error, request, reply) => errorHandler(error, request, reply));

  // Register domain routes
  app.register(healthRoutes, { prefix: '/api/v1' });
  app.register(timeRoutes, { prefix: '/api/v1' });
  app.register(eventRoutes, { prefix: '/api/v1' });
  app.register(worldRoutes, { prefix: '/api/v1' });
  app.register(environmentRoutes, { prefix: '/api/v1' });
  app.register(resourceRoutes, { prefix: '/api/v1' });
  app.register(spatialRoutes, { prefix: '/api/v1/spatial' });
  app.register(systemRoutes, { prefix: '/api/v1' });
  app.register(citizenRoutes, { prefix: '/api/v1' });

  // Initialize engines
  import('./services/world.service').then(m => m.worldService.initialize());
  import('./services/environment.service').then(m => m.environmentService.initialize());
  import('./services/resource.service').then(m => m.resourceService.initialize());
  import('./services/spatial.service').then(m => m.spatialService.initialize());
  import('./services/citizen.service').then(m => m.citizenService.initialize());

  return app;
}
