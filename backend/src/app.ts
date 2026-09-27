import Fastify from 'fastify';
import { persistenceService } from './services/persistence.service';


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
import { workplaceRoutes } from './routes/workplace.routes';
import decisionRoutes from './routes/decision.routes';
import { perceptionRoutes } from './routes/perception.routes';
import { supplyRoutes } from './routes/supply.routes';
import { bankingRoutes } from './routes/banking.routes';
import { liveRoutes } from './routes/live.routes';

export async function buildApp() {
  const app = Fastify({
    logger: true
  });

  app.setErrorHandler((error, request, reply) => errorHandler(error, request, reply));

  // Root routes to prevent 404s when accessed directly via browser
  app.get('/', async (request, reply) => {
    return { status: 'OK', service: 'Genesis Backend API', message: 'API is running. Please access the frontend at http://localhost:5173 during development.' };
  });

  app.get('/favicon.ico', async (request, reply) => {
    reply.code(204).send(); // No content for favicon
  });

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
  app.register(workplaceRoutes, { prefix: '/api/v1' });
  app.register(decisionRoutes, { prefix: '/api/v1' });
  app.register(perceptionRoutes, { prefix: '/api/v1' });
  app.register(supplyRoutes, { prefix: '/api/v1' });
  app.register(bankingRoutes, { prefix: '/api/v1' });
  app.register(liveRoutes, { prefix: '/api/v1' });

  // Bootstrap persistence state
  await persistenceService.bootstrap();

  // Initialize engines sequentially or Promise.all
  await import('./services/world.service').then(m => m.worldService.initialize());
  await import('./services/environment.service').then(m => m.environmentService.initialize());
  await import('./services/resource.service').then(m => m.resourceService.initialize());
  await import('./services/spatial.service').then(m => m.spatialService.initialize());
  await import('./services/citizen.service').then(m => m.citizenService.initialize());
  await import('./services/decision.service').then(m => m.decisionService.initialize());
  await import('./services/perception.service').then(m => m.perceptionService.initialize());
  await import('./services/market.service').then(m => m.marketService.initialize());
  await import('./services/finance.service').then(m => m.financeService.initialize());
  await import('./services/supply.service').then(m => m.supplyService.initialize());
  await import('./services/banking.service').then(m => m.bankingService.initialize());
  
  await import('./services/SpatialBackfillMigration').then(m => m.SpatialBackfillMigration.runMigration());

  return app;
}

// trigger restart 3