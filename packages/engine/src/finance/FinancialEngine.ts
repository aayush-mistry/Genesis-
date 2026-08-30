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
      this.accounting.recordExpense(eventData.producerId, totalCost, mockTx);
    });
  }
}

