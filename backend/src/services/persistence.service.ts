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
      for (const wp of workplaces) {
        try {
          const workplaceObj = {
            id: wp.id,
            type: wp.type,
            locationId: wp.locationId,
            regionId: wp.regionId,
            capacity: wp.capacity,
            occupiedPositions: wp.occupiedPositions,
            vacancies: wp.vacancies,
            inventoryId: wp.inventoryId,
            storageCapacity: wp.storageCapacity,
            walletId: wp.walletId,
            revenue: wp.revenue,
            expenses: wp.expenses,
            profit: wp.profit,
            wallet: undefined
          };
          if (wp.walletId) {
            const wWallet = walletMap.get(wp.walletId);
            if (wWallet) {
              workplaceObj.wallet = {
                id: wWallet.id,
                ownerId: wWallet.ownerId,
                balance: wWallet.balance,
                currency: wWallet.currency,
                totalIncome: wWallet.totalIncome,
                totalExpenses: wWallet.totalExpenses,
                history: []
              };
            }
          }
          const { worldService } = await import('./world.service');
          worldService.engine.workplaceRepository.create(workplaceObj as any);

          // Hydrate inventory for this workplace
          if (wp.inventoryId) {
            const dbInventory = await inventoryRepository.getInventory(wp.inventoryId);
            if (dbInventory) {
              const { supplyService } = await import('./supply.service');
              const inventoryObj: any = {
                id: dbInventory.id,
                ownerId: dbInventory.ownerId,
                storageCapacity: dbInventory.storageCapacity,
                items: {}
              };
              dbInventory.items.forEach(item => {
                 inventoryObj.items[item.productId] = {
                   productId: item.productId,
                   totalQuantity: item.totalQuantity,
                   reservedQuantity: item.reservedQuantity,
                   availableQuantity: item.availableQuantity,
                   unit: item.unit,
                   quality: item.quality,
                   batches: undefined
                 };
              });
              // Insert directly into in-memory engine
              (supplyService.inventoryManager as any).inventories.set(inventoryObj.id, inventoryObj);
            }
          }

        } catch (err) {
          console.error(`Failed to hydrate workplace ${wp.id}:`, err);
        }
      }

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
        
        // 5. Load Pending Events
        const { eventService } = await import('./event.service');
        const { eventRepository } = await import('../repositories/EventRepository');
        
        const pendingEvents = await eventRepository.getPendingEvents();
        console.log(`[PersistenceService] Found ${pendingEvents.length} pending events.`);
        
        for (const event of pendingEvents) {
          try {
            eventService.scheduler.scheduleEvent(event, true); // skipPersistence = true
          } catch (err) {
            console.error(`[PersistenceService] Error hydrating event ${event.id}:`, err);
          }
        }
        
      } else {
        console.log('[PersistenceService] No existing simulation state found. Starting fresh.');
      }
    }
  
    async persistTickBoundary(dirtyCollections: any) {
      const { supplyService } = await import('./supply.service');
      const { worldService } = await import('./world.service');

      // Helper for inventory persistence
      const syncInventory = async (inventory: any) => {
        if (!inventory) return;
        
        // Ensure inventory exists in DB first
        const dbInvCheck = await inventoryRepository.getInventory(inventory.id);
        if (!dbInvCheck) {
          await inventoryRepository.createInventory({
            id: inventory.id,
            ownerId: inventory.ownerId,
            storageCapacity: inventory.storageCapacity || 1000
          });
        }

        for (const item of Object.values(inventory.items) as any[]) {
          await inventoryRepository.setItemExactQuantity(inventory.id, item.productId, item.totalQuantity, item.unit);
        }
        
        const dbInv = await inventoryRepository.getInventory(inventory.id);
        if (dbInv) {
          for (const dbItem of dbInv.items) {
            if (!inventory.items[dbItem.productId]) {
              await inventoryRepository.setItemExactQuantity(inventory.id, dbItem.productId, 0, 'unit');
            }
          }
        }
      };

      // Helper for wallet persistence
      const syncWallet = async (wallet: any) => {
        if (!wallet) return;
        try {
          await financialRepository.updateWallet(wallet.ownerId, wallet.balance, wallet.totalIncome, wallet.totalExpenses);
        } catch (err) {
          // It might not exist in DB yet, try to create and update
          try {
            await financialRepository.createWallet(wallet.ownerId, wallet.currency);
            await financialRepository.updateWallet(wallet.ownerId, wallet.balance, wallet.totalIncome, wallet.totalExpenses);
          } catch (createErr) {
            console.error(`[PersistenceService] Error syncing wallet for ${wallet.ownerId}:`, createErr);
          }
        }
      };

      if (dirtyCollections && dirtyCollections.citizens) {
        for (const citizenId of dirtyCollections.citizens) {
          const citizen = citizenService.engine.getCitizen(citizenId);
          if (citizen) {
            await citizenRepository.updateCitizen(citizenId, {
              vitalStateJson: JSON.stringify(citizen.vitalState),
            });
    
            const inventory = supplyService.inventoryManager.getInventoryByOwner(citizenId);
            await syncInventory(inventory);
            await syncWallet(citizen.wallet);
          }
        }
      }

      // We also need to persist all workplace inventories and wallets that might have changed
      // Instead of relying on dirtyCollections (which may not track workplaces currently),
      // let's iterate all workplaces in the world engine.
      const workplaces = worldService.engine.workplaceRepository.findAll();
      for (const workplace of workplaces) {
        if (workplace.inventoryId) {
          const inventory = supplyService.inventoryManager.getInventory(workplace.inventoryId);
          await syncInventory(inventory);
        }
        if (workplace.wallet) {
          await syncWallet(workplace.wallet);
        }
      }
    }
}

export const persistenceService = new PersistenceService();
