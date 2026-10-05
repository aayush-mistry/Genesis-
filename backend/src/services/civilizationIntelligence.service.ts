import { prisma } from '../repositories/prisma';
import { supplyService } from './supply.service';
import { ProductCategory, WorkplaceType, TransactionType } from '@genesis/shared';
import { NeedsConfig } from '@genesis/engine';

export class CivilizationIntelligenceService {
  
  public async getCivilizationSummary() {
    // 1. Population & Employment
    const population = await prisma.citizen.count();
    
    const employed = await prisma.citizen.count({ where: { employmentStatus: 'EMPLOYED' } });
    const unemployed = await prisma.citizen.count({ where: { employmentStatus: 'UNEMPLOYED' } });
    const student = await prisma.citizen.count({ where: { employmentStatus: 'STUDENT' } });
    const retired = await prisma.citizen.count({ where: { employmentStatus: 'RETIRED' } });
    
    const workforce = employed + unemployed;
    const inactive = student + retired;
    
    // Workforce details
    const workplaces = await prisma.workplace.findMany();
    const activeWorkplaces = workplaces.length;
    let totalVacancies = 0;
    let totalFilledPositions = 0;
    
    workplaces.forEach(wp => {
      totalVacancies += wp.vacancies;
      totalFilledPositions += wp.occupiedPositions;
    });

    // 2. Resource & Inventory State
    const foodProductIds: string[] = [];
    const waterProductIds: string[] = [];
    const otherProductIds: string[] = [];
    
    for (const commodity of supplyService.productionEngine.commodities.values()) {
      if (commodity.category === ProductCategory.FOOD) {
         if (commodity.id === 'water') {
           waterProductIds.push(commodity.id);
         } else {
           foodProductIds.push(commodity.id);
         }
      } else {
        otherProductIds.push(commodity.id);
      }
    }

    // Get inventory quantities grouped by product id
    const inventoryItems = await prisma.inventoryItem.groupBy({
      by: ['productId', 'unit'],
      _sum: { totalQuantity: true }
    });
    
    let foodQuantity = 0;
    let waterQuantity = 0;
    const otherResources: Record<string, number> = {};

    for (const item of inventoryItems) {
      if (foodProductIds.includes(item.productId)) {
        foodQuantity += item._sum.totalQuantity || 0;
      } else if (waterProductIds.includes(item.productId)) {
        waterQuantity += item._sum.totalQuantity || 0;
      } else {
        otherResources[item.productId] = (otherResources[item.productId] || 0) + (item._sum.totalQuantity || 0);
      }
    }
    
    // Theoretical consumption based on domain rules
    // NeedsConfig.HUNGER_RATE_PER_HOUR is 1.5, meaning 36 hunger per day per citizen.
    // We can expose the raw demand values.
    const dailyHungerDemand = population * 36;
    const dailyThirstDemand = population * (NeedsConfig.THIRST_RATE_PER_HOUR * 24);

    // 3. Production Intelligence
    const producerTypes = ['FARM', 'MINE', 'FISHING_SITE', 'FOREST_SITE', 'FACTORY'];
    const producers = workplaces.filter(wp => producerTypes.includes(wp.type));
    
    let activeProducers = 0;
    const productionCapacityByProduct: Record<string, number> = {};
    const productionFrequency = 'Daily'; // Defined in ProductionEngine EventScheduler

    for (const wp of producers) {
      if (wp.occupiedPositions > 0) activeProducers++;
      
      // Attempt to resolve what this workplace produces based on definitions
      let producedProductId: string | null = null;
      if (wp.metadataJson) {
        try {
          const meta = JSON.parse(wp.metadataJson);
          if (meta.producesProductId) producedProductId = meta.producesProductId;
        } catch (e) {}
      }
      
      if (!producedProductId) {
        for (const def of supplyService.productionEngine.productionDefinitions.values()) {
          if (def.workplaceType === wp.type) {
             producedProductId = def.productId;
             break;
          }
        }
      }
      
      if (producedProductId) {
        const def = supplyService.productionEngine.productionDefinitions.get(producedProductId);
        if (def) {
           const baseCapacity = (wp.capacity / def.workersRequiredPerUnitArea) * def.baseYieldPerArea;
           productionCapacityByProduct[producedProductId] = (productionCapacityByProduct[producedProductId] || 0) + baseCapacity;
        }
      }
    }

    // 4. Money & Finance
    // Citizen wallets vs Business wallets
    // Since Wallet has a polymorphic ownerId, we need to map ownerIds.
    // Fortunately, we can query citizens and workplaces to classify them.
    const citizens = await prisma.citizen.findMany({ select: { id: true, walletId: true } });
    const citizenWalletIds = citizens.map(c => c.walletId).filter(id => id !== null);
    
    let citizenMoney = 0;
    if (citizenWalletIds.length > 0) {
      const agg = await prisma.wallet.aggregate({
        where: { id: { in: citizenWalletIds as string[] } },
        _sum: { balance: true }
      });
      citizenMoney = agg._sum.balance || 0;
    }
    
    const wpWalletIds = workplaces.map(w => w.walletId).filter(id => id !== null);
    let businessMoney = 0;
    if (wpWalletIds.length > 0) {
      const agg = await prisma.wallet.aggregate({
        where: { id: { in: wpWalletIds as string[] } },
        _sum: { balance: true }
      });
      businessMoney = agg._sum.balance || 0;
    }
    
    const banks = await prisma.bank.findMany();
    let bankMoney = 0;
    banks.forEach(b => {
       bankMoney += b.reserves;
    });
    
    const totalMoney = citizenMoney + businessMoney + bankMoney;
    
    // Transactions
    const transactionCount = await prisma.transactionRecord.count();
    
    // 5. Commerce / Supply Chain
    const stores = workplaces.filter(w => ['SHOP', 'WHOLESALE'].includes(w.type)).length;
    const orders = await prisma.order.groupBy({
      by: ['status'],
      _count: true
    });
    let pendingOrders = 0;
    let fulfilledOrders = 0;
    orders.forEach(o => {
       if (o.status === 'PENDING') pendingOrders += o._count;
       else if (o.status === 'FULFILLED') fulfilledOrders += o._count;
    });
    
    const shipments = await prisma.shipment.groupBy({
      by: ['status'],
      _count: true
    });
    let activeShipments = 0;
    let completedShipments = 0;
    shipments.forEach(s => {
       if (s.status === 'IN_TRANSIT') activeShipments += s._count;
       else if (s.status === 'DELIVERED') completedShipments += s._count;
    });

    // Activity classification
    const working = await prisma.citizen.count({ where: { movementState: 'WORKING' } });
    const travelling = await prisma.citizen.count({ where: { movementState: 'TRAVELLING' } });
    const shopping = await prisma.citizen.count({ where: { movementState: 'SHOPPING' } });
    const idle = await prisma.citizen.count({ where: { movementState: 'IDLE' } });

    return {
      population: {
        total: population
      },
      employment: {
        workforce,
        employed,
        unemployed,
        inactive,
        students: student,
        retired,
        vacancies: totalVacancies,
        filledPositions: totalFilledPositions
      },
      resources: {
        food: {
          quantity: foodQuantity,
          unit: 'kg',
          dailyHungerDemand,
          // If we want to evaluate sufficiency, we can map hunger demand to specific food values, 
          // but avoiding fake logic is preferred. We expose raw numbers.
        },
        water: {
          quantity: waterQuantity,
          unit: 'L',
          dailyThirstDemand
        },
        other: otherResources
      },
      production: {
        activeProducers,
        productionCapacityByProduct,
        productionFrequency
      },
      finance: {
        totalMoney,
        citizenMoney,
        businessMoney,
        bankMoney,
        transactionCount
      },
      commerce: {
        activeStores: stores
      },
      supplyChain: {
        pendingOrders,
        fulfilledOrders,
        activeShipments,
        completedShipments
      },
      activity: {
        working,
        travelling,
        shopping,
        idle
      }
    };
  }
}

export const civilizationIntelligenceService = new CivilizationIntelligenceService();
