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

    console.log('[Finance Service] Initialized');
  }
}

export const financeService = new FinanceService();
