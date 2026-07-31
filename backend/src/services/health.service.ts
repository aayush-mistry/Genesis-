import { prisma } from '../repositories/prisma';
import { SystemStatus, GENESIS_CONFIG } from '@genesis/shared';
import { logger } from '../utils/logger';

export class HealthService {
  async getSystemStatus() {
    let dbStatus = SystemStatus.OFFLINE;
    
    try {
      // Simple check to see if database is reachable
      await prisma.$queryRaw`SELECT 1`;
      dbStatus = SystemStatus.ONLINE;
    } catch (error) {
      logger.error('Database connection failed in health check', error);
      dbStatus = SystemStatus.ERROR;
    }

    return {
      status: 'ok',
      version: GENESIS_CONFIG.VERSION,
      phase: GENESIS_CONFIG.PHASE,
      services: {
        api: SystemStatus.ONLINE,
        database: dbStatus,
      },
      timestamp: new Date().toISOString(),
    };
  }
}
