import { simulationRepository, worldRepository, citizenRepository } from '../repositories';

export class PersistenceService {
  async bootstrap() {
    console.log('[PersistenceService] Bootstrapping Genesis engines from database...');
    
    // 1. Load Simulation State
    const simState = await simulationRepository.getSimulationState();
    if (simState) {
      console.log(`[PersistenceService] Found Simulation State: Year ${simState.time.year}, Speed: ${simState.speed}`);
      
      // 2. Load World if active
      if (simState.activeWorldId) {
        const worldData = await worldRepository.getWorld(simState.activeWorldId);
        if (worldData) {
          console.log(`[PersistenceService] Loaded World: ${worldData.name}`);
          // Engines will hydrate this data...
        }
      }

      // 3. Load Citizens
      const citizens = await citizenRepository.listCitizens();
      console.log(`[PersistenceService] Loaded ${citizens.length} citizens from persistence.`);
    } else {
      console.log('[PersistenceService] No existing simulation state found. Starting fresh.');
    }
  }

  async persistTickBoundary(dirtyCollections: any) {
    // Expected to be called by TimeEngine at the end of a tick.
    // Iterates through dirty Collections and batch-updates Prisma.
    // Example: citizenRepository.updateCitizen() for all items in dirtyCollections.citizens
  }
}

export const persistenceService = new PersistenceService();
