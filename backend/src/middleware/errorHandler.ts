import { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { logger } from '../utils/logger';
import { ZodError } from 'zod';

export function errorHandler(error: FastifyError, request: FastifyRequest, reply: FastifyReply) {
  logger.error(error);

  if (error instanceof ZodError) {
    return reply.status(400).send({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Validation Error',
      details: error.format(),
    });
  }

  const statusCode = error.statusCode || 500;
  reply.status(statusCode).send({
    statusCode,
    error: statusCode === 500 ? 'Internal Server Error' : error.name,
    message: statusCode === 500 ? 'An unexpected error occurred' : error.message,
  });
}
