import { 
  simulationRepository, 
  worldRepository, 
  citizenRepository, 
  financialRepository, 
  inventoryRepository, 
  workplaceRepository 
} from '../repositories';
import { citizenService } from './citizen.service';
import { supplyService } from './supply.service';

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

      // Pre-load all wallets to hydrate without N+1 queries if possible.
      const wallets = await financialRepository.listWallets();
      const walletMap = new Map(wallets.map(w => [w.ownerId, w]));

      // 3. Load Workplaces
      const workplaces = await workplaceRepository.listWorkplaces();
      console.log(`[PersistenceService] Loaded ${workplaces.length} workplaces.`);

      // 4. Load Citizens
      const citizens = await citizenRepository.listCitizens();
      console.log(`[PersistenceService] Loaded ${citizens.length} citizens from persistence.`);
      
      let hydratedCount = 0;
      for (const dbCitizen of citizens) {
        try {
          const dbWallet = walletMap.get(dbCitizen.id);
          const dbInventory = await inventoryRepository.getInventoryByOwner(dbCitizen.id);

            let inventoryObj: any = undefined;
            if (dbInventory) {
              const itemsMap: Record<string, any> = {};
              dbInventory.items.forEach(item => {
                 itemsMap[item.productId] = {
                   productId: item.productId,
                   totalQuantity: item.totalQuantity,
                   reservedQuantity: item.reservedQuantity,
                   availableQuantity: item.availableQuantity,
                   unit: item.unit,
                   quality: item.quality,
                   batches: undefined
                 };
              });
              inventoryObj = {
                id: dbInventory.id,
                ownerId: dbInventory.ownerId,
                storageCapacity: dbInventory.storageCapacity,
                items: itemsMap
              };
              (supplyService.inventoryManager as any).inventories.set(inventoryObj.id, inventoryObj);
            }

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
              
              birthDate: dbCitizen.birthDateJson ? JSON.parse(dbCitizen.birthDateJson) : {},
              createdAt: dbCitizen.createdAtSimJson ? JSON.parse(dbCitizen.createdAtSimJson) : {},
              vitalState: dbCitizen.vitalStateJson ? JSON.parse(dbCitizen.vitalStateJson) : {},
              personality: dbCitizen.personalityJson ? JSON.parse(dbCitizen.personalityJson) : {},
              activeRoute: dbCitizen.activeRouteJson ? JSON.parse(dbCitizen.activeRouteJson) : null,
              skills: dbCitizen.skillsJson ? JSON.parse(dbCitizen.skillsJson) : [],
              jobSchedule: dbCitizen.jobScheduleJson ? JSON.parse(dbCitizen.jobScheduleJson) : null,
              
              wallet: dbWallet ? {
                id: dbWallet.id,
                ownerId: dbWallet.ownerId,
                balance: dbWallet.balance,
                currency: dbWallet.currency,
                totalIncome: dbWallet.totalIncome,
                totalExpenses: dbWallet.totalExpenses
              } : undefined,

              inventory: inventoryObj
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
      if (!dirtyCollections || !dirtyCollections.citizens) return;
      
      const { supplyService } = await import('./supply.service');

      for (const citizenId of dirtyCollections.citizens) {
        const citizen = citizenService.engine.getCitizen(citizenId);
        if (citizen) {
          await citizenRepository.updateCitizen(citizenId, {
            vitalStateJson: JSON.stringify(citizen.vitalState),
          });
  
          const inventory = supplyService.inventoryManager.getInventoryByOwner(citizenId);
          if (inventory) {
            // Because we might consume everything (quantity 0 means remove from DB), we must handle deletes.
            // Also we must know what was removed. A simple way is to clear and recreate, OR
            // iterate over DB items and if they aren't in memory, delete them.
            // For T5.2, we only care about exact quantity syncing.
            // Let's iterate memory items and upsert them exactly.
            for (const item of Object.values(inventory.items)) {
              await inventoryRepository.setItemExactQuantity(inventory.id, item.productId, item.totalQuantity, item.unit);
            }
            
            // For items that reached 0 and were removed from memory:
            // We should ideally fetch current DB items and remove ones not in memory.
            const dbInv = await inventoryRepository.getInventory(inventory.id);
            if (dbInv) {
              for (const dbItem of dbInv.items) {
                if (!inventory.items[dbItem.productId]) {
                  await inventoryRepository.setItemExactQuantity(inventory.id, dbItem.productId, 0, 'unit');
                }
              }
            }
          }
        }
      }
    }
}

export const persistenceService = new PersistenceService();
