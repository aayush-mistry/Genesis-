import { TransactionLedger } from './TransactionLedger';
import { BusinessAccounting } from './BusinessAccounting';
import { ProductionCostCalculator } from './ProductionCostCalculator';
import { WorldEngine } from '../world/WorldEngine';
import { MarketEngine } from '../market/MarketEngine';
import { TransactionRecord, TransactionType } from '@genesis/shared';
import { EventScheduler } from '../events/EventScheduler';
import { TimeEngine } from '../time/TimeEngine';
import { TimeUtils } from '../utils/TimeUtils';
import { randomUUID } from 'crypto';

export class FinancialEngine {
  public ledger: TransactionLedger;
  public accounting: BusinessAccounting;
  public productionCostCalculator: ProductionCostCalculator;

  constructor(
    private worldEngine: WorldEngine,
    private marketEngine: MarketEngine,
    private eventScheduler: EventScheduler,
    private timeEngine: TimeEngine
  ) {
    this.ledger = new TransactionLedger();
    this.accounting = new BusinessAccounting(this.worldEngine);
    this.productionCostCalculator = new ProductionCostCalculator(this.worldEngine);

    // Listen for market transactions
    this.eventScheduler.emitter.on('TransactionCompleted', (tx: TransactionRecord) => {
      this.ledger.recordTransaction(tx);
      
      // Handle compensating transaction reversals
      if (tx.referenceType === 'TRANSACTION_REVERSAL' && tx.referenceId) {
        const origTx = this.ledger.getTransaction(tx.referenceId) || (this.marketEngine ? this.marketEngine.getTransaction(tx.referenceId) : undefined);
        if (origTx) {
          if (origTx.transactionType === 'PURCHASE' || origTx.transactionType === 'SALE' || origTx.transactionType === 'RETAIL_PROCUREMENT' || origTx.transactionType === 'WHOLESALE_PURCHASE') {
            this.accounting.recordRevenueReversal(origTx.sellerId, origTx.totalPrice);
            this.accounting.recordExpenseReversal(origTx.buyerId, origTx.totalPrice);
          } else if (origTx.transactionType === 'WAGE' || origTx.transactionType === 'TRANSPORT_EXPENSE') {
            this.accounting.recordExpenseReversal(origTx.buyerId, origTx.totalPrice);
          }
        }
        return;
      }

      // Update accounting
      if (tx.transactionType === 'PURCHASE' || tx.transactionType === 'SALE' || tx.transactionType === 'RETAIL_PROCUREMENT' || tx.transactionType === 'WHOLESALE_PURCHASE') {
        this.accounting.recordRevenue(tx.sellerId, tx.totalPrice, tx);
        this.accounting.recordExpense(tx.buyerId, tx.totalPrice, tx);
      } else if (tx.transactionType === 'WAGE' || tx.transactionType === 'TRANSPORT_EXPENSE') {
        this.accounting.recordExpense(tx.buyerId, tx.totalPrice, tx); // Buyer is employer/shipper
      }
    });

    this.eventScheduler.emitter.on('ProductionCompleted', (eventData: any) => {
      const costResult = this.productionCostCalculator.calculateCost(eventData.producerId, eventData.resourcesConsumed || {});
      const totalCost = costResult.totalCost;
      
      const mockTx: TransactionRecord = {
        transactionId: randomUUID(),
        timestamp: TimeUtils.toSeconds(this.timeEngine.getCurrentTime()),
        buyerId: eventData.producerId,
        sellerId: 'SYSTEM_PRODUCTION',
        productId: eventData.productId,
        quantity: eventData.quantity,
        unit: eventData.unit,
        unitPrice: totalCost / (eventData.quantity || 1),
        totalPrice: totalCost,
        currency: 'INR',
        transactionType: TransactionType.EXPENSE,
        regionId: eventData.regionId,
        description: `Production Cost (Labor: ${costResult.laborCost.toFixed(2)}, Input: ${costResult.inputCost.toFixed(2)})`,
        referenceType: 'PRODUCTION'
      };

      this.ledger.recordTransaction(mockTx);
      
      // Track as a metric instead of a cash expense to avoid duplicating 
      // actual PURCHASE (materials) and WAGE (labor) cash deductions.
      this.accounting.recordProductionMetrics(eventData.producerId, costResult);
    });

    this.eventScheduler.emitter.on('InventorySpoiled', (spoilageRecord: import('@genesis/shared').SpoilageRecord) => {
      const txId = `TX-${spoilageRecord.id}`;
      if (this.ledger.getTransaction(txId)) {
        return; // Idempotent
      }

      const workplace = this.worldEngine.workplaceRepository.findById(spoilageRecord.ownerId);

      const spoilageTx: TransactionRecord = {
        transactionId: txId,
        timestamp: spoilageRecord.timestamp,
        buyerId: spoilageRecord.ownerId,
        sellerId: 'SYSTEM_SPOILAGE',
        productId: spoilageRecord.productId,
        quantity: spoilageRecord.quantity,
        unit: spoilageRecord.unit,
        unitPrice: spoilageRecord.unitPrice,
        totalPrice: spoilageRecord.totalLoss ?? 0,
        currency: 'GEN',
        transactionType: TransactionType.INVENTORY_SPOILAGE,
        regionId: workplace?.regionId || 'UNKNOWN',
        description: spoilageRecord.valuationUnavailable
          ? `Inventory Spoilage Loss (Valuation Unavailable): ${spoilageRecord.quantity} ${spoilageRecord.unit} of ${spoilageRecord.productId}`
          : `Inventory Spoilage Loss: ${spoilageRecord.quantity} ${spoilageRecord.unit} of ${spoilageRecord.productId} at ${spoilageRecord.unitPrice} per ${spoilageRecord.unit}`,
        referenceId: spoilageRecord.id,
        referenceType: 'INVENTORY_SPOILAGE'
      };

      this.ledger.recordTransaction(spoilageTx);

      if (spoilageRecord.totalLoss && spoilageRecord.totalLoss > 0) {
        this.accounting.recordSpoilageLoss(spoilageRecord.ownerId, spoilageRecord.totalLoss, spoilageRecord);
      }
    });
  }
}

