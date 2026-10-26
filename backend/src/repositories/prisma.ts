import { PrismaClient } from '@prisma/client';
import { env } from '../config/env';

export const prisma = new PrismaClient({
  datasources: process.env.DATABASE_URL ? { db: { url: process.env.DATABASE_URL } } : undefined,
  log: env.NODE_ENV === 'development' ? ['query', 'info', 'warn', 'error'] : ['error'],
});
