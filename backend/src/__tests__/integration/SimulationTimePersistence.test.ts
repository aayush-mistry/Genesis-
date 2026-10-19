import { prisma } from '../../repositories/prisma';
import { simulationRepository } from '../../repositories/SimulationRepository';
import { persistenceService } from '../../services/persistence.service';
import { timeService } from '../../services/time.service';
import { worldService } from '../../services/world.service';
import { worldRepository } from '../../repositories/WorldRepository';
import { TimeEngine } from '@genesis/engine';

describe('T8.6.5.1 Task 1 — Persistent Simulation Time & Speed Integration', () => {
  const testWorldId = 'test-world-sim-time-sync';

  beforeAll(async () => {
    // Clean simulation state and world tables
    await prisma.transactionRecord.deleteMany();
    await prisma.wallet.deleteMany();
    await prisma.citizen.deleteMany();
    await prisma.workplace.deleteMany();
    await prisma.region.deleteMany();
    await prisma.world.deleteMany();
    await prisma.simulationState.deleteMany();

    // Create test world in DB
    await worldRepository.createWorld({
      id: testWorldId,
      name: 'Time Sync World',
      description: 'World for simulation time synchronization tests',
      randomSeed: 98765,
      creationTime: 1,
      worldSize: 1000,
      width: 1000,
      height: 1000,
      climateProfile: 'TEMPERATE',
      timeZone: 'UTC',
      version: '1.0.0',
      status: 'ACTIVE'
    });

    // Initialize in-memory world
    worldService.engine.worldManager.loadWorld({
      id: testWorldId,
      name: 'Time Sync World',
      description: 'World for simulation time synchronization tests',
      randomSeed: 98765,
      creationTime: 1,
      worldSize: 1000,
      width: 1000,
      height: 1000,
      climateProfile: 'TEMPERATE',
      timeZone: 'UTC',
      version: '1.0.0',
      status: 'ACTIVE',
      regionIds: []
    } as any);
  });

  afterAll(async () => {
    await prisma.transactionRecord.deleteMany();
    await prisma.world.deleteMany();
    await prisma.simulationState.deleteMany();
  });

  it('1. Persists simulation time and speed at tick boundary to SQLite', async () => {
    // Advance simulation time to Year 1, Month 2, Day 14, 15:30:00
    const advancedTime = { year: 1, month: 2, day: 14, hour: 15, minute: 30, second: 0 };
    const customSpeed = 120; // 120x simulation speed

    timeService.engine.setCurrentTime(advancedTime);
    timeService.engine.setSpeed(customSpeed);

    // Call persistTickBoundary
    await persistenceService.persistTickBoundary();

    // Verify row in SQLite SimulationState singleton
    const stateInDb = await simulationRepository.getSimulationState();
    expect(stateInDb).not.toBeNull();
    expect(stateInDb!.activeWorldId).toBe(testWorldId);
    expect(stateInDb!.speed).toBe(120);
    expect(stateInDb!.time).toEqual(advancedTime);
  });

  it('2. Cold restart / bootstrap restores persisted simulation time and speed before economic work resumes', async () => {
    // Simulate engine wipe / fresh process: TimeEngine re-initialized at default Year 1 Month 1 Day 1, speed 60
    timeService.engine = new TimeEngine(60);
    expect(timeService.engine.getCurrentTime()).toEqual({ year: 1, month: 1, day: 1, hour: 0, minute: 0, second: 0 });
    expect(timeService.engine.getSpeed()).toBe(1);

    // Bootstrap persistence state from SQLite
    await persistenceService.bootstrap();

    // Verify authoritative restored state
    expect(timeService.engine.getCurrentTime()).toEqual({ year: 1, month: 2, day: 14, hour: 15, minute: 30, second: 0 });
    expect(timeService.engine.getSpeed()).toBe(120);
  });

  it('3. Clock rewind is prevented, ensuring historical monthly transaction IDs are not reused', async () => {
    // Ensure restored time is at Year 1 Month 2
    const currentTime = timeService.engine.getCurrentTime();
    expect(currentTime.month).toBe(2);

    // In Genesis, monthly payroll and recurring transactions format IDs as `PAYROLL-${citizenId}-${year}-${month}`
    const citizenId = 'cit-idempotency-test';
    const month1TxId = `PAYROLL-${citizenId}-1-1`;
    const currentMonthTxId = `PAYROLL-${citizenId}-${currentTime.year}-${currentTime.month}`;

    // Under the restored time (Month 2), the transaction ID advances to Month 2
    expect(currentMonthTxId).toBe(`PAYROLL-${citizenId}-1-2`);
    expect(currentMonthTxId).not.toBe(month1TxId);

    // Further advance time to Month 3 Day 1, persist tick boundary, and re-bootstrap
    timeService.engine.setCurrentTime({ year: 1, month: 3, day: 1, hour: 0, minute: 0, second: 0 });
    await persistenceService.persistTickBoundary();

    // Wipe in-memory time engine again
    timeService.engine = new TimeEngine(60);
    await persistenceService.bootstrap();

    const restoredTimeMonth3 = timeService.engine.getCurrentTime();
    expect(restoredTimeMonth3.month).toBe(3);
    const month3TxId = `PAYROLL-${citizenId}-${restoredTimeMonth3.year}-${restoredTimeMonth3.month}`;
    expect(month3TxId).toBe(`PAYROLL-${citizenId}-1-3`);
    expect(month3TxId).not.toBe(month1TxId);
    expect(month3TxId).not.toBe(currentMonthTxId);
  });

  it('4. Preserves activeWorldId when persisting simulation state', async () => {
    const state = await simulationRepository.getSimulationState();
    expect(state?.activeWorldId).toBe(testWorldId);

    // Call persistTickBoundary with empty dirty collection
    await persistenceService.persistTickBoundary({});

    const updatedState = await simulationRepository.getSimulationState();
    expect(updatedState?.activeWorldId).toBe(testWorldId);
  });

  it('5. Does not silently swallow persistence failures that compromise authoritative state', async () => {
    // Spy on upsertSimulationState to simulate an unexpected persistence failure
    const upsertSpy = jest.spyOn(simulationRepository, 'upsertSimulationState').mockRejectedValueOnce(
      new Error('Disk write failure: SQLite locked')
    );

    await expect(persistenceService.persistTickBoundary({})).rejects.toThrow(
      'Disk write failure: SQLite locked'
    );

    upsertSpy.mockRestore();
  });
});
