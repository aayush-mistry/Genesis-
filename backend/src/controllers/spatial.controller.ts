import { FastifyRequest, FastifyReply } from 'fastify';
import { spatialService } from '../services/spatial.service';
import { SpatialCalculator } from '@genesis/engine';

export class SpatialController {
  
  public static async getDistance(req: FastifyRequest, reply: FastifyReply) {
    const { x1, y1, x2, y2 } = req.query as any;

    if (x1 === undefined || y1 === undefined || x2 === undefined || y2 === undefined) {
      return reply.status(400).send({ error: 'Missing coordinates for distance calculation (x1, y1, x2, y2)' });
    }

    const dist = SpatialCalculator.calculateDistance(
      { x: Number(x1), y: Number(y1) },
      { x: Number(x2), y: Number(y2) }
    );

    return reply.send({ distance: dist });
  }

  public static async getNearby(req: FastifyRequest, reply: FastifyReply) {
    const { x, y, radius, type, limit } = req.query as any;

    if (x === undefined || y === undefined || radius === undefined) {
      return reply.status(400).send({ error: 'Missing parameters for nearby query (x, y, radius)' });
    }

    const entities = spatialService.engine.queryService.findNearby(
      { x: Number(x), y: Number(y) },
      Number(radius),
      {
        type: type ? String(type) : undefined,
        limit: limit ? Number(limit) : undefined
      }
    );

    return reply.send({ entities });
  }

  public static async getNearest(req: FastifyRequest, reply: FastifyReply) {
    const { x, y, type } = req.query as any;

    if (x === undefined || y === undefined) {
      return reply.status(400).send({ error: 'Missing parameters for nearest query (x, y)' });
    }

    const entity = spatialService.engine.queryService.findNearest(
      { x: Number(x), y: Number(y) },
      type ? String(type) : undefined
    );

    if (!entity) {
      return reply.status(404).send({ error: 'No nearest entity found' });
    }

    return reply.send({ entity });
  }

  public static async getEntitiesInRegion(req: FastifyRequest, reply: FastifyReply) {
    const { regionId } = req.params as { regionId: string };
    const { type } = req.query as any;

    const entities = spatialService.engine.queryService.findEntitiesInRegion(regionId, {
      type: type ? String(type) : undefined
    });

    return reply.send({ entities });
  }

  public static async getStatistics(req: FastifyRequest, reply: FastifyReply) {
    const stats = spatialService.engine.index.getStatistics();
    
    return reply.send({
      ...stats,
      queryCount: 0, // Would be tracked if needed
      indexStatus: 'Healthy'
    });
  }
}
