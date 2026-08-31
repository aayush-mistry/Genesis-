import { prisma } from './prisma';
import { SimulationTime } from '@genesis/shared';

export class SimulationRepository {
  async getSimulationState() {
    const state = await prisma.simulationState.findUnique({
      where: { id: 'singleton' },
    });
    if (!state) return null;
    return {
      activeWorldId: state.activeWorldId,
      speed: state.speed,
      time: {
        year: state.year,
        month: state.month,
        day: state.day,
        hour: state.hour,
        minute: state.minute,
        second: state.second,
      } as SimulationTime,
    };
  }

  async upsertSimulationState(time: SimulationTime, speed: number, activeWorldId: string | null) {
    return prisma.simulationState.upsert({
      where: { id: 'singleton' },
      update: {
        year: time.year,
        month: time.month,
        day: time.day,
        hour: time.hour,
        minute: time.minute,
        second: time.second,
        speed,
        activeWorldId,
      },
      create: {
        id: 'singleton',
        year: time.year,
        month: time.month,
        day: time.day,
        hour: time.hour,
        minute: time.minute,
        second: time.second,
        speed,
        activeWorldId,
      },
    });
  }
}

export const simulationRepository = new SimulationRepository();
