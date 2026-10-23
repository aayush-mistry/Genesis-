import { buildApp } from './app';
import { env } from './config/env';
import { logger } from './utils/logger';
import { prisma } from './repositories/prisma';

async function start() {
  try {
    const app = await buildApp();
    await app.listen({ port: env.PORT, host: '0.0.0.0' });
    logger.info(`Server listening on port ${env.PORT}`);

    const handleSignal = async (signal: string) => {
      logger.info(`Received ${signal}, shutting down gracefully...`);
      try {
        await app.close();
        logger.info('Graceful shutdown complete.');
        process.exit(0);
      } catch (err) {
        logger.error(`Error during graceful shutdown: ${err}`);
        process.exit(1);
      }
    };

    process.on('SIGINT', () => handleSignal('SIGINT'));
    process.on('SIGTERM', () => handleSignal('SIGTERM'));
  } catch (err) {
    logger.error(err);
    await prisma.$disconnect();
    process.exit(1);
  }
}

start();
// trigger restart 3