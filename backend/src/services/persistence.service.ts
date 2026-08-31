import { simulationRepository, worldRepository, citizenRepository } from '../repositories';
import { citizenService } from './citizen.service';

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
      
      let hydratedCount = 0;
      for (const dbCitizen of citizens) {
        try {
          const memCitizen: any = {
            id: dbCitizen.id,
            name: dbCitizen.name,
            gender: dbCitizen.gender,
            status: dbCitizen.status,
            locationId: dbCitizen.locationId,
            movementState: dbCitizen.movementState,
            employmentStatus: dbCitizen.employmentStatus,
            workplaceId: dbCitizen.workplaceId,
            jobType: dbCitizen.jobType,
            householdId: dbCitizen.householdId,
            
            // Parse JSON fields safely
            birthDate: dbCitizen.birthDateJson ? JSON.parse(dbCitizen.birthDateJson) : {},
            createdAt: dbCitizen.createdAtSimJson ? JSON.parse(dbCitizen.createdAtSimJson) : {},
            vitalState: dbCitizen.vitalStateJson ? JSON.parse(dbCitizen.vitalStateJson) : {},
            personality: dbCitizen.personalityJson ? JSON.parse(dbCitizen.personalityJson) : {},
            activeRoute: dbCitizen.activeRouteJson ? JSON.parse(dbCitizen.activeRouteJson) : null,
            skills: dbCitizen.skillsJson ? JSON.parse(dbCitizen.skillsJson) : [],
            jobSchedule: dbCitizen.jobScheduleJson ? JSON.parse(dbCitizen.jobScheduleJson) : null,
            
            // Mock wallet for now to satisfy interface if not fully loaded
            wallet: { id: dbCitizen.walletId || `wallet-${dbCitizen.id}`, ownerId: dbCitizen.id, balance: 1000, currency: 'GEN', totalIncome: 0, totalExpenses: 0 }
          };
          
          (citizenService.engine as any).repository.create(memCitizen);
          hydratedCount++;
        } catch (err) {
          console.error(`[PersistenceService] Error hydrating citizen ${dbCitizen.id}:`, err);
        }
      }
      console.log(`[PersistenceService] Hydrated ${hydratedCount} citizens into in-memory engine.`);
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
