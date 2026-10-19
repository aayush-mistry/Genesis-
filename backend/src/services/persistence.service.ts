import { 
  simulationRepository, 
  worldRepository, 
  citizenRepository, 
  financialRepository, 
  inventoryRepository, 
  workplaceRepository,
  resourceRepository
} from '../repositories';
import { prisma } from '../repositories/prisma';
import { citizenService } from './citizen.service';
import { supplyService } from './supply.service';

export class PersistenceService {
  async bootstrap() {
    console.log('[PersistenceService] Bootstrapping Genesis engines from database...');
    
    // 1. Load Simulation State
    const simState = await simulationRepository.getSimulationState();
    if (simState) {
      console.log(`[PersistenceService] Found Simulation State: Year ${simState.time.year}, Speed: ${simState.speed}`);
      
      const { timeService } = await import('./time.service');
      timeService.engine.setCurrentTime(simState.time);
      if (simState.speed) {
        timeService.engine.setSpeed(simState.speed);
      }
      
      // 2. Load World if active
      if (simState.activeWorldId) {
        const worldData = await worldRepository.getWorld(simState.activeWorldId);
        if (worldData) {
          console.log(`[PersistenceService] Loaded World: ${worldData.name}`);
          const { worldService } = await import('./world.service');
          worldService.engine.worldManager.loadWorld({
             ...worldData,
             creationTime: worldData.creationTime ? worldData.creationTime : Date.now(),
             width: worldData.width,
             height: worldData.height,
             regionIds: worldData.regions ? worldData.regions.map(r => r.id) : []
          } as any);

          // Hydrate spatial entities
          if (worldData.regions) {
            worldData.regions.forEach(regionData => {
              const region = {
                ...regionData,
                coordinates: { x: regionData.coordX, y: regionData.coordY },
                width: regionData.width,
                height: regionData.height,
                cityIds: regionData.cities ? regionData.cities.map(c => c.id) : []
              };
              (worldService.engine.regionManager as any).regions.set(region.id, region);

              if (regionData.cities) {
                regionData.cities.forEach(cityData => {
                  const city = {
                    ...cityData,
                    coordinates: { x: cityData.coordX, y: cityData.coordY },
                    width: cityData.width,
                    height: cityData.height,
                    districtIds: cityData.districts ? cityData.districts.map(d => d.id) : []
                  };
                  (worldService.engine.cityManager as any).cities.set(city.id, city);

                  if (cityData.districts) {
                    cityData.districts.forEach(districtData => {
                      const district = {
                        ...districtData,
                        coordinates: { x: districtData.coordX, y: districtData.coordY },
                        width: districtData.width,
                        height: districtData.height,
                        buildingIds: districtData.buildings ? districtData.buildings.map(b => b.id) : []
                      };
                      (worldService.engine.districtManager as any).districts.set(district.id, district);

                      if (districtData.buildings) {
                        districtData.buildings.forEach(buildingData => {
                          let metadata = undefined;
                          if (buildingData.metadataJson) {
                            try {
                              metadata = typeof buildingData.metadataJson === 'string'
                                ? JSON.parse(buildingData.metadataJson)
                                : buildingData.metadataJson;
                            } catch (e) {
                              // ignore
                            }
                          }
                          const building = {
                            ...buildingData,
                            metadata: metadata || (buildingData as any).metadata,
                            coordinates: { x: buildingData.coordX, y: buildingData.coordY },
                            width: buildingData.width,
                            height: buildingData.height,
                            roomIds: buildingData.rooms ? buildingData.rooms.map(r => r.id) : []
                          };
                          (worldService.engine.buildingManager as any).buildings.set(building.id, building);
                        });
                      }
                    });
                  }
                });
              }
            });
          }

          // Hydrate Resources
          const { resourceService } = await import('./resource.service');
          resourceService.engine.resourceManager.clear();
          const allRegions = Array.from((worldService.engine.regionManager as any).regions.values()) as any[];
          for (const region of allRegions) {
            const dbResources = await resourceRepository.getResourcesByRegion(region.id);
            for (const r of dbResources) {
              const resObj = {
                id: r.id,
                name: r.name,
                type: r.type as any,
                category: r.category as any,
                unit: r.unit,
                renewable: r.renewable,
                regionId: r.regionId,
                coordinates: { x: r.coordX, y: r.coordY },
                radius: r.radius,
                currentAmount: r.currentAmount,
                maximumAmount: r.maximumAmount,
                naturalRecoveryRate: r.naturalRecoveryRate,
                consumptionRate: r.consumptionRate,
                condition: (r.conditionType && r.conditionValue !== null && r.conditionValue !== undefined) 
                  ? { type: r.conditionType, value: r.conditionValue } 
                  : null,
                extractionDifficulty: r.extractionDifficulty,
                tradable: r.tradable,
                borrowable: r.borrowable,
                exportable: r.exportable,
                reservedAmount: r.reservedAmount,
                createdAt: r.createdAt,
                updatedAt: r.updatedAt
              };
              
              resourceService.engine.resourceManager.loadResource(resObj as any);
            }
          }
        }
      } else {
         console.log('[PersistenceService] activeWorldId is null. Will not hydrate partial entities.');
         return;
      }

      // Pre-load all wallets to hydrate without N+1 queries if possible.
      const wallets = await financialRepository.listWallets();
      const walletMap = new Map(wallets.map(w => [w.ownerId, w]));
      const { marketService } = await import('./market.service');
      for (const w of wallets) {
        if (w.ownerId.startsWith('utility-')) {
          marketService.engine.registerWallet({
            id: w.id,
            ownerId: w.ownerId,
            balance: w.balance,
            currency: w.currency,
            totalIncome: w.totalIncome,
            totalExpenses: w.totalExpenses
          });
        }
      }

      // Hydrate historical transactions into MarketEngine for idempotency across restarts
      try {
        const dbTransactions = await prisma.transactionRecord.findMany({
          take: 10000,
          orderBy: { timestamp: 'desc' }
        });
        marketService.engine.loadTransactions(dbTransactions.map(tx => ({
          transactionId: tx.transactionId,
          timestamp: tx.timestamp,
          buyerId: tx.buyerId,
          sellerId: tx.sellerId,
          productId: tx.productId,
          quantity: tx.quantity,
          unit: tx.unit,
          unitPrice: tx.unitPrice,
          totalPrice: tx.totalPrice,
          currency: tx.currency,
          transactionType: tx.transactionType as any,
          regionId: tx.regionId,
          description: tx.description ?? undefined,
          referenceId: tx.referenceId ?? undefined,
          referenceType: tx.referenceType ?? undefined
        })));
      } catch (err) {
        console.error('[PersistenceService] Error hydrating transaction records into MarketEngine:', err);
      }

      // 3. Load Workplaces
      const workplaces = await workplaceRepository.listWorkplaces();
      console.log(`[PersistenceService] Loaded ${workplaces.length} workplaces.`);
      for (const wp of workplaces) {
        try {
          const workplaceObj: any = {
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
            accounting: wp.accountingHistoryJson ? { history: JSON.parse(wp.accountingHistoryJson) } : undefined,
            wallet: undefined,
            positions: [],
            inventoryConfiguration: ['SHOP', 'BUSINESS', 'WHOLESALE'].includes(wp.type) ? {
              'wheat': { reorderPoint: 50, targetStock: 200 },
              'iron_ore': { reorderPoint: 20, targetStock: 100 },
              'water': { reorderPoint: 100, targetStock: 500 },
              'raw_fish': { reorderPoint: 30, targetStock: 150 },
              'timber': { reorderPoint: 20, targetStock: 100 }
            } : undefined
          };
          const wWallet = (wp.walletId ? walletMap.get(wp.id) : undefined) || walletMap.get(wp.id);
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
                   batches: item.batchesJson ? JSON.parse(item.batchesJson) : [{ quantity: item.availableQuantity, acquiredAt: 0, status: 'FRESH' }]
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

      // 3.5 Load Households
      const dbHouseholds = await prisma.household.findMany();
      console.log(`[PersistenceService] Loaded ${dbHouseholds.length} households from persistence.`);
      for (const dbHh of dbHouseholds) {
        citizenService.engine.householdService.registerHousehold({
          id: dbHh.id,
          locationId: dbHh.locationId,
          inventoryId: dbHh.inventoryId,
          walletId: dbHh.walletId,
          members: []
        });

        // Hydrate household inventory
        const dbHhInv = await inventoryRepository.getInventory(dbHh.inventoryId);
        if (dbHhInv) {
          const itemsMap: Record<string, any> = {};
          dbHhInv.items.forEach(item => {
            itemsMap[item.productId] = {
              productId: item.productId,
              totalQuantity: item.totalQuantity,
              reservedQuantity: item.reservedQuantity,
              availableQuantity: item.availableQuantity,
              unit: item.unit,
              quality: item.quality,
              batches: item.batchesJson ? JSON.parse(item.batchesJson) : [{ quantity: item.availableQuantity, acquiredAt: 0, status: 'FRESH' }]
            };
          });
          (supplyService.inventoryManager as any).inventories.set(dbHhInv.id, {
            id: dbHhInv.id,
            ownerId: dbHhInv.ownerId,
            storageCapacity: dbHhInv.storageCapacity,
            items: itemsMap
          });
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
                   batches: item.batchesJson ? JSON.parse(item.batchesJson) : [{ quantity: item.availableQuantity, acquiredAt: 0, status: 'FRESH' }]
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
              coordX: dbCitizen.coordX ?? null,
              coordY: dbCitizen.coordY ?? null,
              movementState: dbCitizen.movementState,
              employmentStatus: dbCitizen.employmentStatus,
              workplaceId: dbCitizen.workplaceId,
              jobType: dbCitizen.jobType,
              householdId: dbCitizen.householdId || undefined,
              
              birthDate: dbCitizen.birthDateJson ? JSON.parse(dbCitizen.birthDateJson) : {},
              createdAt: dbCitizen.createdAtSimJson ? JSON.parse(dbCitizen.createdAtSimJson) : {},
              vitalState: dbCitizen.vitalStateJson ? JSON.parse(dbCitizen.vitalStateJson) : {},
              personality: dbCitizen.personalityJson ? JSON.parse(dbCitizen.personalityJson) : {},
              activeRoute: dbCitizen.activeRouteJson ? JSON.parse(dbCitizen.activeRouteJson) : null,
              skills: dbCitizen.skillsJson ? JSON.parse(dbCitizen.skillsJson) : [],
              jobSchedule: dbCitizen.jobScheduleJson ? JSON.parse(dbCitizen.jobScheduleJson) : null,
              employmentRecord: dbCitizen.employmentRecJson ? JSON.parse(dbCitizen.employmentRecJson) : undefined,
              
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
            if (dbCitizen.householdId) {
              citizenService.engine.householdService.addMember(dbCitizen.householdId, dbCitizen.id);
            } else if (dbCitizen.status === 'ACTIVE') {
              citizenService.engine.placementService.trackUnhoused(dbCitizen.id);
            }
            hydratedCount++;
          } catch (err) {
            console.error(`[PersistenceService] Error hydrating citizen ${dbCitizen.id}:`, err);
          }
        }
        console.log(`[PersistenceService] Hydrated ${hydratedCount} citizens into in-memory engine.`);

        // Clean up empty households that have no members to prevent ghost occupancy
        const allHouseholds = citizenService.engine.householdService.getAllHouseholds();
        for (const hh of allHouseholds) {
          if (hh.members.length === 0) {
            citizenService.engine.householdService.removeHousehold(hh.id);
            await prisma.household.deleteMany({ where: { id: hh.id } });
          }
        }

        // 4.5 Load and Hydrate Supply Chain State (Orders & Shipments)
        const { commerceRepository } = await import('../repositories/CommerceRepository');
        const { worldService } = await import('./world.service');
        const dbOrders = await commerceRepository.listAllOrders();
        supplyService.supplyChainEngine.loadOrders(dbOrders);
        console.log(`[PersistenceService] Hydrated ${dbOrders.length} orders into SupplyChainEngine.`);

        const dbShipments = await commerceRepository.listAllShipments();
        supplyService.supplyChainEngine.loadShipments(dbShipments);
        console.log(`[PersistenceService] Hydrated ${dbShipments.length} shipments into SupplyChainEngine.`);

        // Validate references for active in-transit shipments
        const inTransitShipments = supplyService.supplyChainEngine.getAllActiveShipments();
        for (const shipment of inTransitShipments) {
          const associatedOrder = Array.from(supplyService.supplyChainEngine.getAllOrders())
            .find(o => o.shipmentId === shipment.shipmentId || (shipment.orderId && o.orderId === shipment.orderId));
          
          if (!associatedOrder) {
            console.error(`[PersistenceService] Inconsistent supply chain state: In-transit shipment ${shipment.shipmentId} has no associated order.`);
          }

          const originWorkplace = worldService.engine.workplaceRepository.findById(shipment.originId);
          const destinationWorkplace = worldService.engine.workplaceRepository.findById(shipment.destinationId);

          if (!originWorkplace && !destinationWorkplace) {
            console.warn(`[PersistenceService] In-transit shipment ${shipment.shipmentId} references missing seller ${shipment.originId} and destination ${shipment.destinationId}. Recovery will be handled explicitly.`);
          }
        }

        // 4.6 Load Transactions into MarketEngine
        const dbTransactions = await prisma.transactionRecord.findMany();
        marketService.engine.loadTransactions(dbTransactions as any[]);
        console.log(`[PersistenceService] Hydrated ${dbTransactions.length} transactions into MarketEngine.`);
        
        // 5. Load Pending Events
        const { eventService } = await import('./event.service');
        const { eventRepository } = await import('../repositories/EventRepository');
        
        const pendingEvents = await eventRepository.getPendingEvents();
        console.log(`[PersistenceService] Found ${pendingEvents.length} pending events.`);
        
        for (const event of pendingEvents) {
          try {
            if (!eventService.scheduler.getUpcomingEvents().some(e => e.id === event.id)) {
              eventService.scheduler.scheduleEvent(event, true); // skipPersistence = true
            }
          } catch (err) {
            console.error(`[PersistenceService] Error hydrating event ${event.id}:`, err);
          }
        }

        // Ensure every in-transit shipment has a scheduled arrival event without duplicating
        const upcomingEvents = eventService.scheduler.getUpcomingEvents();
        for (const shipment of inTransitShipments) {
          const eventId = `shipment-${shipment.shipmentId}`;
          const alreadyScheduled = upcomingEvents.some(e => e.id === eventId);
          if (!alreadyScheduled) {
            const associatedOrder = Array.from(supplyService.supplyChainEngine.getAllOrders())
              .find(o => o.shipmentId === shipment.shipmentId || (shipment.orderId && o.orderId === shipment.orderId));
            
            const arrivalSeconds = shipment.estimatedArrival || (shipment.departureTime ? shipment.departureTime + 3600 : 0);
            const { TimeUtils } = await import('@genesis/engine');
            const arrivalTime = TimeUtils.fromSeconds(arrivalSeconds);
            const currentTime = timeService.engine.getCurrentTime();

            eventService.scheduler.scheduleEvent({
              id: eventId,
              name: 'Shipment Arrival',
              description: `Shipment ${shipment.shipmentId} arrives at ${shipment.destinationId}`,
              priority: 'Normal',
              status: 'Scheduled',
              createdTime: shipment.departureTime ? TimeUtils.fromSeconds(shipment.departureTime) : TimeUtils.clone(currentTime),
              scheduledTime: arrivalTime,
              sourceModule: 'SupplyChainEngine',
              targetModule: 'SupplyChainEngine',
              cancelFlag: false,
              retryCount: 0,
              metadata: {
                shipmentId: shipment.shipmentId,
                orderId: associatedOrder?.orderId || shipment.orderId || ''
              },
              handlerName: 'SupplyChainEngine.handleShipmentArrival'
            }, true);
            console.log(`[PersistenceService] Reconstructed missing arrival event for shipment ${shipment.shipmentId}.`);
          }
        }

        // 5.1 Hydrate Completed Production Cycles for Idempotency
        try {
          const { supplyService } = await import('./supply.service');
          const completedEvents = await prisma.simulationEvent.findMany({
            where: {
              handlerName: 'ProductionEngine.runProductionCycle',
              status: 'Completed'
            },
            select: { id: true, metadataJson: true }
          });
          for (const ev of completedEvents) {
            supplyService.productionEngine.recordCompletedCycle(ev.id);
            if (ev.metadataJson) {
              try {
                const meta = JSON.parse(ev.metadataJson);
                if (meta.cycleId) {
                  supplyService.productionEngine.recordCompletedCycle(meta.cycleId);
                }
              } catch (_) {}
            }
          }
          console.log(`[PersistenceService] Hydrated ${completedEvents.length} completed production cycles.`);
        } catch (err) {
          console.error('[PersistenceService] Error hydrating completed production cycles:', err);
        }

        // 5.2 Hydrate Completed Resource Regeneration Intervals for Idempotency
        try {
          const { resourceService } = await import('./resource.service');
          const completedRegenEvents = await prisma.simulationEvent.findMany({
            where: {
              handlerName: 'ResourceEngine.processRegeneration',
              status: 'Completed'
            },
            select: { id: true, metadataJson: true }
          });
          for (const ev of completedRegenEvents) {
            resourceService.engine.recordProcessedInterval(ev.id);
            if (ev.metadataJson) {
              try {
                const meta = JSON.parse(ev.metadataJson);
                if (meta.intervalId) {
                  resourceService.engine.recordProcessedInterval(meta.intervalId);
                }
              } catch (_) {}
            }
          }
          console.log(`[PersistenceService] Hydrated ${completedRegenEvents.length} completed resource regeneration intervals.`);
        } catch (err) {
          console.error('[PersistenceService] Error hydrating completed regeneration intervals:', err);
        }
        
        // 6. Hydrate Consumption Ledger from persistence
        try {
          const { consumptionService } = await import('./consumption.service');
          await consumptionService.hydrateFromDatabase();
        } catch (err) {
          console.error('[PersistenceService] Error hydrating consumption ledger:', err);
        }

      } else {
        console.log('[PersistenceService] No existing simulation state found. Starting fresh.');
      }
    }
  
    async persistTickBoundary(dirtyCollections?: any) {
      const { supplyService } = await import('./supply.service');
      const { worldService } = await import('./world.service');

      // Persist authoritative simulation time and speed
      try {
        const { timeService } = await import('./time.service');
        const world = worldService.engine.worldManager.getWorld();
        const existingState = await simulationRepository.getSimulationState();
        const activeWorldId = world?.id ?? existingState?.activeWorldId ?? null;
        const currentTime = timeService.engine.getCurrentTime();
        const currentSpeed = timeService.engine.getSpeed();
        await simulationRepository.upsertSimulationState(currentTime, currentSpeed, activeWorldId);
      } catch (err) {
        console.error('[PersistenceService] Error persisting simulation state in persistTickBoundary:', err);
        throw err;
      }

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
          await inventoryRepository.setItemExactQuantity(
            inventory.id, 
            item.productId, 
            item.totalQuantity, 
            item.unit,
            item.batches ? JSON.stringify(item.batches) : undefined
          );
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
          const existing = await financialRepository.getWalletByOwner(wallet.ownerId);
          if (existing) {
            await financialRepository.updateWallet(wallet.ownerId, wallet.balance, wallet.totalIncome, wallet.totalExpenses);
          } else {
            await financialRepository.createWallet(wallet.ownerId, wallet.currency);
            await financialRepository.updateWallet(wallet.ownerId, wallet.balance, wallet.totalIncome, wallet.totalExpenses);
          }
        } catch (err) {
          console.error(`[PersistenceService] Error syncing wallet for ${wallet.ownerId}:`, err);
        }
      };

      // Helper for household persistence
      const syncHousehold = async (hhId: string): Promise<boolean> => {
        let dbHh = await prisma.household.findUnique({ where: { id: hhId } });
        if (!dbHh) {
          const inMemHh = citizenService.engine.householdService.getHousehold(hhId);
          if (inMemHh) {
            dbHh = await prisma.household.upsert({
              where: { id: inMemHh.id },
              create: {
                id: inMemHh.id,
                locationId: inMemHh.locationId,
                inventoryId: inMemHh.inventoryId,
                walletId: inMemHh.walletId
              },
              update: {
                locationId: inMemHh.locationId,
                inventoryId: inMemHh.inventoryId,
                walletId: inMemHh.walletId
              }
            });
            const hhInv = supplyService.inventoryManager.getInventory(inMemHh.inventoryId);
            if (hhInv) {
              await syncInventory(hhInv);
            }
          }
        }
        return !!dbHh;
      };

      if (dirtyCollections && dirtyCollections.households) {
        const hhList = Array.from(dirtyCollections.households) as string[];
        for (const hhId of hhList) {
          const inMemHh = citizenService.engine.householdService.getHousehold(hhId);
          if (inMemHh) {
            await syncHousehold(hhId);
          } else {
            await prisma.household.deleteMany({ where: { id: hhId } });
          }
        }
      }

      if (dirtyCollections && dirtyCollections.citizens) {
        const citizenList = Array.from(dirtyCollections.citizens) as string[];
        for (const citizenId of citizenList) {
          const citizen = citizenService.engine.getCitizen(citizenId);
          if (citizen) {
            const dbCit = await citizenRepository.getCitizen(citizenId);
            // Verify and persist household before citizen to guarantee valid FK
            let validHouseholdId = citizen.householdId || null;
            if (validHouseholdId) {
              const exists = await syncHousehold(validHouseholdId);
              if (!exists) validHouseholdId = null;
            }

            if (dbCit) {
              await citizenRepository.updateCitizen(citizenId, {
                status: citizen.status,
                employmentStatus: citizen.employmentStatus,
                workplaceId: citizen.workplaceId,
                jobType: citizen.jobType,
                vitalStateJson: JSON.stringify(citizen.vitalState),
                locationId: citizen.locationId || null,
                householdId: validHouseholdId,
                coordX: citizen.coordX ?? null,
                coordY: citizen.coordY ?? null,
                movementState: citizen.movementState,
                activeRouteJson: citizen.activeRoute ? JSON.stringify(citizen.activeRoute) : null,
                employmentRecJson: citizen.employmentRecord ? JSON.stringify(citizen.employmentRecord) : null,
              });
            } else {
              // Newly born or immigrated citizen
              await citizenRepository.createCitizen({
                id: citizen.id,
                name: citizen.name,
                gender: citizen.gender,
                status: citizen.status,
                locationId: citizen.locationId || null,
                coordX: citizen.coordX ?? null,
                coordY: citizen.coordY ?? null,
                birthDateJson: JSON.stringify(citizen.birthDate),
                createdAtSimJson: JSON.stringify(citizen.createdAt),
                vitalStateJson: JSON.stringify(citizen.vitalState),
                personalityJson: JSON.stringify(citizen.personality),
                movementState: citizen.movementState,
                employmentStatus: citizen.employmentStatus,
                workplaceId: citizen.workplaceId,
                jobType: citizen.jobType,
                householdId: validHouseholdId,
                walletId: citizen.wallet?.id || null,
                activeRouteJson: citizen.activeRoute ? JSON.stringify(citizen.activeRoute) : null,
                skillsJson: JSON.stringify(citizen.skills || []),
                jobScheduleJson: citizen.jobSchedule ? JSON.stringify(citizen.jobSchedule) : null,
              });
            }
    
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

        // Synchronize workplace financial metrics to database (GAP-4)
        const revenue = workplace.revenue !== undefined
          ? workplace.revenue
          : (workplace.wallet?.totalIncome ?? 0);
        const expenses = workplace.expenses !== undefined
          ? workplace.expenses
          : (workplace.wallet?.totalExpenses ?? 0);
        const profit = workplace.profit !== undefined
          ? workplace.profit
          : (revenue - expenses);

        // Keep in-memory model synchronized with authoritative numbers
        workplace.revenue = revenue;
        workplace.expenses = expenses;
        workplace.profit = profit;

        const accountingHistoryJson = workplace.accounting?.history
          ? JSON.stringify(workplace.accounting.history)
          : null;

        try {
          await workplaceRepository.updateFinancials(
            workplace.id,
            revenue,
            expenses,
            profit,
            workplace.occupiedPositions,
            workplace.vacancies,
            accountingHistoryJson
          );
        } catch (_) {
          // Workplace not yet in database or table uninitialized in partial test fixtures
        }
      }

      // Sync Regional Resources (consumption and regeneration)
      try {
        const { resourceService } = await import('./resource.service');
        const allResources = resourceService.engine.resourceManager.getAllResources();
        for (const res of allResources) {
          try {
            await resourceRepository.updateResourceState(
              res.id,
              res.currentAmount,
              res.condition?.value
            );
          } catch (_) {
            // Resource not yet persisted or table uninitialized in partial fixture
          }
        }
      } catch (err) {
        console.error('[PersistenceService] Error persisting resources in persistTickBoundary:', err);
      }

      // Sync Registered Wallets (e.g. Utility Wallets)
      try {
        const { marketService } = await import('./market.service');
        const regWallets = marketService.engine.getRegisteredWallets();
        for (const w of regWallets) {
          await syncWallet(w);
        }
      } catch (err) {
        console.error('[PersistenceService] Error persisting utility wallets in persistTickBoundary:', err);
      }

      // Sync Transactions from MarketEngine
      try {
        const { marketService } = await import('./market.service');
        const transactions = marketService.engine.getAllTransactions();
        for (const tx of transactions) {
          await prisma.transactionRecord.upsert({
            where: { transactionId: tx.transactionId },
            create: {
              transactionId: tx.transactionId,
              timestamp: tx.timestamp,
              buyerId: tx.buyerId,
              sellerId: tx.sellerId,
              productId: tx.productId ?? null,
              quantity: tx.quantity ?? null,
              unit: tx.unit ?? null,
              unitPrice: tx.unitPrice ?? null,
              totalPrice: tx.totalPrice,
              currency: tx.currency,
              transactionType: tx.transactionType,
              regionId: tx.regionId,
              referenceId: tx.referenceId ?? null,
              referenceType: tx.referenceType ?? null
            },
            update: {
              referenceId: tx.referenceId ?? null,
              referenceType: tx.referenceType ?? null
            }
          });
        }
      } catch (err) {
        console.error('[PersistenceService] Error persisting transactions in persistTickBoundary:', err);
      }

      // Sync Supply Chain State (Orders and Shipments)
      try {
        await supplyService.supplyChainEngine.flushPersistence();
        const { commerceRepository } = await import('../repositories/CommerceRepository');
        const allOrders = supplyService.supplyChainEngine.getAllOrders();
        for (const order of allOrders) {
          await commerceRepository.upsertOrder(order);
        }
        const allShipments = supplyService.supplyChainEngine.getAllShipments();
        for (const shipment of allShipments) {
          await commerceRepository.upsertShipment(shipment);
        }
      } catch (err) {
        console.error('[PersistenceService] Error persisting orders and shipments in persistTickBoundary:', err);
      }
    }
}

export const persistenceService = new PersistenceService();
