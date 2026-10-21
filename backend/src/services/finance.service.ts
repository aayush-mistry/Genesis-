import { FinancialEngine } from '@genesis/engine';
import { worldService } from './world.service';
import { marketService } from './market.service';
import { eventService } from './event.service';
import { timeService } from './time.service';
import { citizenService } from './citizen.service';

class FinanceService {
  public engine: FinancialEngine;

  constructor() {
    this.engine = new FinancialEngine(
      worldService.engine,
      marketService.engine,
      eventService.scheduler,
      timeService.engine
    );
    this.engine.productionCostCalculator.citizenProvider = (id) => citizenService.engine.getCitizen(id);
    marketService.setProductionCostCalculator(this.engine.productionCostCalculator);
  }
  public initialize() {
    this.engine.productionCostCalculator.citizenProvider = (id) => citizenService.engine.getCitizen(id);
    marketService.setProductionCostCalculator(this.engine.productionCostCalculator);

    // Listen to completed transactions to persist them to the database
    eventService.scheduler.emitter.on('TransactionCompleted', async (tx) => {
      try {
        const { prisma } = await import('../repositories/prisma');
        await prisma.transactionRecord.create({
          data: {
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
            transactionType: tx.transactionType,
            regionId: tx.regionId,
            description: tx.description,
            referenceId: tx.referenceId,
            referenceType: tx.referenceType
          }
        });
      } catch (error: any) {
        if (error.code === 'P2002') {
          console.log(`[Finance Service] Transaction ${tx.transactionId} already exists (idempotency caught).`);
        } else {
          console.error('[Finance Service] Failed to persist transaction:', error);
        }
      }
    });

    eventService.scheduler.emitter.on('InventorySpoiled', async (record: import('@genesis/shared').SpoilageRecord) => {
      try {
        console.log(`[Finance Service] Processing InventorySpoiled event: ${record.id}`);
        const { prisma } = await import('../repositories/prisma');
        const txId = `TX-${record.id}`;

        let regionId = record.regionId;
        if (!regionId) {
          const wp = worldService.engine.workplaceRepository.findById(record.ownerId);
          if (wp && wp.regionId) {
            regionId = wp.regionId;
          }
        }

        const created = await prisma.transactionRecord.create({
          data: {
            transactionId: txId,
            timestamp: record.timestamp,
            buyerId: record.ownerId,
            sellerId: 'SYSTEM_SPOILAGE',
            productId: record.productId,
            quantity: record.quantity,
            unit: record.unit,
            unitPrice: record.unitPrice,
            totalPrice: record.totalLoss ?? 0,
            currency: 'GEN',
            transactionType: 'INVENTORY_SPOILAGE',
            regionId: regionId || 'UNKNOWN',
            description: record.valuationUnavailable
              ? `Spoilage Loss (Valuation Unavailable): ${record.quantity} ${record.unit} of ${record.productId}`
              : `Spoilage Loss: ${record.quantity} ${record.unit} of ${record.productId} at ${record.unitPrice} per ${record.unit}`,
            referenceId: record.id,
            referenceType: 'INVENTORY_SPOILAGE'
          }
        });
        console.log(`[Finance Service] Persisted spoilage transaction: ${created.transactionId}`);
      } catch (error: any) {
        if (error.code === 'P2002') {
          console.log(`[Finance Service] Spoilage transaction TX-${record.id} already exists (idempotency caught).`);
        } else {
          console.error('[Finance Service] Failed to persist spoilage transaction:', error);
        }
      }
    });

    console.log('[Finance Service] Initialized');
  }
}

export const financeService = new FinanceService();
