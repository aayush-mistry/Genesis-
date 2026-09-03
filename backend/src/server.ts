import { buildApp } from './app';
import { env } from './config/env';
import { logger } from './utils/logger';
import { prisma } from './repositories/prisma';

async function start() {
  try {
    const app = await buildApp();
    await app.listen({ port: env.PORT, host: '0.0.0.0' });
    logger.info(`Server listening on port ${env.PORT}`);
  } catch (err) {
    logger.error(err);
    await prisma.$disconnect();
    process.exit(1);
  }
}

start();