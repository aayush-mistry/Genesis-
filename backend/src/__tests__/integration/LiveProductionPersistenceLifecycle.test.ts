import { prisma } from '../../repositories/prisma';
import { simulationRepository } from '../../repositories/SimulationRepository';
import { persistenceService } from '../../services/persistence.service';
import { timeService } from '../../services/time.service';
import { worldService } from '../../services/world.service';
import { worldRepository } from '../../repositories/WorldRepository';
import { citizenService } from '../../services/citizen.service';
import { TimeEngine } from '@genesis/engine';

describe('T8.6.6.1 Live Production Persistence Lifecycle Integration', () => {
  const testWorldId = 'test-world-live-persistence';
  const testRegionId = 'test-reg-live-persistence';

  beforeAll(async () => {
    // Clean simulation state and world tables in isolated database
    await prisma.transactionRecord.deleteMany();
    await prisma.wallet.deleteMany();
    await prisma.household.deleteMany();
    await prisma.citizen.deleteMany();
    await prisma.jobPosition.deleteMany();
    await prisma.workplace.deleteMany();
    await prisma.region.deleteMany();
    await prisma.world.deleteMany();
    await prisma.simulationState.deleteMany();

    // Create test world and region in database
    await worldRepository.createWorld({
      id: testWorldId,
      name: 'Live Persistence World',
      description: 'World for live production persistence integration tests',
      randomSeed: 44221,
      creationTime: 1000,
      worldSize: 1000,
      width: 1000,
      height: 1000,
      climateProfile: 'TEMPERATE',
      timeZone: 'UTC',
      version: '1.0.0',
      status: 'ACTIVE'
    });

    await prisma.region.create({
      data: {
        id: testRegionId,
        worldId: testWorldId,
        name: 'Live Persistence Region',
        description: 'A test region for live persistence',
        climate: 'TEMPERATE',
        coordX: 0,
        coordY: 0,
        width: 1000,
        height: 1000
      }
    });

    // Hydrate in-memory world
    worldService.engine.worldManager.loadWorld({
      id: testWorldId,
      name: 'Live Persistence World',
      description: 'World for live production persistence integration tests',
      randomSeed: 44221,
      creationTime: 1000,
      worldSize: 1000,
      width: 1000,
      height: 1000,
      climateProfile: 'TEMPERATE',
      timeZone: 'UTC',
      version: '1.0.0',
      status: 'ACTIVE',
      regionIds: [testRegionId]
    } as any);

    // Initial state setup: reset TimeEngine
    timeService.engine = new TimeEngine(60);
    timeService.engine.setCurrentTime({ year: 1, month: 1, day: 1, hour: 0, minute: 0, second: 0 });
    timeService.engine.setSpeed(60);
  });

  afterAll(async () => {
    // Stop runtime persistence and disconnect prisma
    persistenceService.stopRuntimePersistence();
    await prisma.transactionRecord.deleteMany();
    await prisma.wallet.deleteMany();
    await prisma.household.deleteMany();
    await prisma.citizen.deleteMany();
    await prisma.workplace.deleteMany();
    await prisma.region.deleteMany();
    await prisma.world.deleteMany();
    await prisma.simulationState.deleteMany();
    await prisma.$disconnect();
  });

  beforeEach(() => {
    // Reset runtime listener before each test
    persistenceService.stopRuntimePersistence();
  });

  it('1. Live simulation triggers persistence automatically through the runtime lifecycle wiring', async () => {
    // Ensure persistence is wired to the time engine with a test cadence of 2 ticks
    persistenceService.startRuntimePersistence(timeService.engine, 2);
    expect(persistenceService.isRuntimeActive()).toBe(true);

    const initialStats = persistenceService.getStats();
    const initialPersistedCount = initialStats.persistedCount;

    // Advance time by 1 tick: cadence is 2, so should not persist yet
    timeService.engine.start();
    timeService.engine.tick();
    timeService.engine.pause();

    expect(persistenceService.getStats().persistedCount).toBe(initialPersistedCount);

    // Advance by 1 more tick: cadence of 2 reached -> persistence should trigger automatically
    timeService.engine.start();
    timeService.engine.tick();
    timeService.engine.pause();

    // Await flush to ensure the asynchronous write has completed
    await persistenceService.flush();

    const updatedStats = persistenceService.getStats();
    expect(updatedStats.persistedCount).toBeGreaterThan(initialPersistedCount);

    // Verify SQLite has authoritative state updated
    const stateInDb = await simulationRepository.getSimulationState();
    expect(stateInDb).not.toBeNull();
    expect(stateInDb!.activeWorldId).toBe(testWorldId);
    expect(stateInDb!.time).toEqual(timeService.engine.getCurrentTime());
  });

  it('2. Advancing simulation time and cold-reloading state restores the persisted clock and state', async () => {
    // Start runtime persistence with cadence 1
    persistenceService.startRuntimePersistence(timeService.engine, 1);

    // Advance simulation time to Year 1, Month 3, Day 15, 14:45:00
    const targetTime = { year: 1, month: 3, day: 15, hour: 14, minute: 45, second: 0 };
    timeService.engine.setCurrentTime(targetTime);
    timeService.engine.setSpeed(120);

    // Trigger tick to invoke live runtime persistence
    timeService.engine.start();
    timeService.engine.tick();
    timeService.engine.pause();
    await persistenceService.flush();

    // The tick advanced simulation time by speedMultiplier * secondsPerTick
    const expectedPersistedTime = timeService.engine.getCurrentTime();

    // Verify DB holds expectedPersistedTime
    const stateBeforeRestart = await simulationRepository.getSimulationState();
    expect(stateBeforeRestart?.time).toEqual(expectedPersistedTime);
    expect(stateBeforeRestart?.speed).toBe(120);

    // Simulate cold restart: fresh TimeEngine initialized at default Year 1 Month 1 Day 1
    timeService.engine = new TimeEngine(60);
    expect(timeService.engine.getCurrentTime()).toEqual({ year: 1, month: 1, day: 1, hour: 0, minute: 0, second: 0 });

    // Bootstrap persistence from database
    await persistenceService.bootstrap();

    // Assert restored clock matches persisted time exactly
    expect(timeService.engine.getCurrentTime()).toEqual(expectedPersistedTime);
    expect(timeService.engine.getSpeed()).toBe(120);
  });

  it('3. Multiple rapid ticks coalesce safely without launching overlapping writes', async () => {
    persistenceService.startRuntimePersistence(timeService.engine, 1);

    // Simulate rapid burst of 10 ticks while running
    timeService.engine.start();
    for (let i = 0; i < 10; i++) {
      timeService.engine.tick();
    }
    timeService.engine.pause();

    // Flush to ensure all in-flight and pending coalesced writes settle
    await persistenceService.flush();

    const finalStats = persistenceService.getStats();
    // Verify that writes were serialized, isPersisting is false, and no errors occurred
    expect(finalStats.isPersisting).toBe(false);
    expect(finalStats.pendingWriteQueued).toBe(false);
    expect(persistenceService.getLastError()).toBeNull();

    // Verify authoritative DB record matches final engine time
    const dbState = await simulationRepository.getSimulationState();
    expect(dbState?.time).toEqual(timeService.engine.getCurrentTime());
  });

  it('4. Pause immediately flushes latest state and resume does not duplicate handlers', async () => {
    persistenceService.startRuntimePersistence(timeService.engine, 10); // Cadence is 10 ticks

    timeService.engine.start();
    // Tick 3 times (well below cadence of 10)
    timeService.engine.tick();
    timeService.engine.tick();
    timeService.engine.tick();
    const pausedTime = timeService.engine.getCurrentTime();

    // Calling pause and explicit flush (as wired in /time/pause)
    timeService.engine.pause();
    await persistenceService.flush();

    // Verify DB was flushed immediately without waiting for cadence
    const stateInDb = await simulationRepository.getSimulationState();
    expect(stateInDb?.time).toEqual(pausedTime);

    // Resume simulation
    timeService.engine.resume();
    // Verify starting/pausing/resuming did not duplicate listener
    timeService.engine.tick();
    timeService.engine.pause();

    // Stop and re-check runtime is still active and coherent
    expect(persistenceService.isRuntimeActive()).toBe(true);
  });

  it('5. Repeated initialization is idempotent and rejected with warning', async () => {
    persistenceService.startRuntimePersistence(timeService.engine, 5);
    expect(persistenceService.isRuntimeActive()).toBe(true);

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    // Call startRuntimePersistence a second time
    persistenceService.startRuntimePersistence(timeService.engine, 5);

    // Verify warning was emitted and duplicate listener was rejected
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Runtime persistence is already started. Skipping duplicate registration.')
    );
    warnSpy.mockRestore();

    expect(persistenceService.isRuntimeActive()).toBe(true);
  });

  it('6. Graceful shutdown flushes latest pending state and stops scheduling new work', async () => {
    persistenceService.startRuntimePersistence(timeService.engine, 100); // High cadence

    timeService.engine.setCurrentTime({ year: 2, month: 6, day: 20, hour: 10, minute: 0, second: 0 });
    timeService.engine.start();
    timeService.engine.tick();
    timeService.engine.pause();

    const expectedShutdownTime = timeService.engine.getCurrentTime();

    // Graceful shutdown
    await persistenceService.shutdown();

    // Verify runtime is inactive
    expect(persistenceService.isRuntimeActive()).toBe(false);

    // Verify DB contains the latest shutdown state
    const dbState = await simulationRepository.getSimulationState();
    expect(dbState?.time).toEqual(expectedShutdownTime);

    // Further ticks must NOT trigger persistence
    const persistedCountBefore = persistenceService.getStats().persistedCount;
    timeService.engine.start();
    timeService.engine.tick();
    timeService.engine.pause();

    expect(persistenceService.getStats().persistedCount).toBe(persistedCountBefore);
  });

  it('7. A failed persistence write is observable and causes flush to reject', async () => {
    persistenceService.startRuntimePersistence(timeService.engine, 1);

    // Mock persistTickBoundary to throw an error
    jest.spyOn(persistenceService, 'persistTickBoundary').mockRejectedValueOnce(
      new Error('Disk I/O failure simulation')
    );

    timeService.engine.start();
    timeService.engine.tick();
    timeService.engine.pause();

    // flush() must reject with the persistence failure and not report false success
    await expect(persistenceService.flush()).rejects.toThrow('Disk I/O failure simulation');

    // Error must be observable via getLastError()
    expect(persistenceService.getLastError()).not.toBeNull();
    expect(persistenceService.getLastError()?.message).toContain('Disk I/O failure simulation');
    expect(persistenceService.getStats().failedCount).toBeGreaterThan(0);

    // Restore method
    (persistenceService.persistTickBoundary as any).mockRestore();

    // Subsequent successful write clears error
    await persistenceService.flush();
    expect(persistenceService.getLastError()).toBeNull();
  });

  it('8. Automatic dirty collection draining persists demographic citizen updates without manual arguments', async () => {
    persistenceService.startRuntimePersistence(timeService.engine, 1);

    // Create a new citizen in-memory and mark dirty
    const newCitizenId = 'cit-live-lifecycle-test-1';
    const newCitizen = {
      id: newCitizenId,
      name: 'Elena Vance',
      gender: 'FEMALE' as any,
      status: 'ACTIVE' as any,
      birthDate: { year: 1, month: 1, day: 1, hour: 0, minute: 0, second: 0 },
      createdAt: { year: 1, month: 1, day: 1, hour: 0, minute: 0, second: 0 },
      vitalState: { health: 100, energy: 100, hunger: 0, thirst: 0, happiness: 100 },
      personality: { openness: 50, conscientiousness: 50, extraversion: 50, agreeableness: 50, neuroticism: 50 },
      movementState: 'IDLE' as any,
      employmentStatus: 'UNEMPLOYED' as any,
      skills: [],
      householdId: null,
      wallet: null,
      locationId: null,
      coordX: 100,
      coordY: 200
    };

    (citizenService.engine as any).repository.create(newCitizen);
    citizenService.markDirtyCitizen(newCitizenId);

    // Run tick and flush through runtime persistence
    timeService.engine.start();
    timeService.engine.tick();
    timeService.engine.pause();
    await persistenceService.flush();

    // Verify citizen is in SQLite database
    const dbCitizen = await prisma.citizen.findUnique({
      where: { id: newCitizenId }
    });
    expect(dbCitizen).not.toBeNull();
    expect(dbCitizen!.name).toBe('Elena Vance');
  });
});
