import { TransactionRecord, TransactionType, Wallet } from '@genesis/shared';
import { EventScheduler } from '../events/EventScheduler';
import { TimeEngine } from '../time/TimeEngine';
import { TimeUtils } from '../utils/TimeUtils';
import { randomUUID } from 'crypto';
import { WorldEngine } from '../world/WorldEngine';

export class MarketEngine {
  private transactions: Map<string, TransactionRecord> = new Map();

  constructor(
    private worldEngine: WorldEngine,
    private timeEngine: TimeEngine,
    private eventScheduler: EventScheduler,
    private citizenWalletLookup?: (citizenId: string) => Wallet | undefined
  ) {}

  public processTransaction(
    buyerId: string,
    sellerId: string,
    productId: string | null,
    quantity: number | null,
    unit: string | null,
    unitPrice: number | null,
    totalPrice: number,
    currency: string,
    transactionType: TransactionType,
    regionId: string
  ): TransactionRecord | null {
    // Basic validation
    if (totalPrice < 0) return null;

    // We need to fetch wallets. Since buyer/seller can be Citizens or Workplaces,
    // we need to look them up. This requires a robust lookup.
    // For now, we assume we have a way to fetch the wallet of an entity.
    let buyerWallet = this.getWallet(buyerId);
    let sellerWallet = this.getWallet(sellerId);

    // If it's a purchase/expense/wage, buyer must have enough funds.
    if (buyerWallet && buyerWallet.balance < totalPrice) {
      return null; // Insufficient funds
    }

    // Execute transfer
    if (buyerWallet) {
      buyerWallet.balance -= totalPrice;
      buyerWallet.totalExpenses += totalPrice;
    }

    if (sellerWallet) {
      sellerWallet.balance += totalPrice;
      sellerWallet.totalIncome += totalPrice;
    }

    const transaction: TransactionRecord = {
      transactionId: randomUUID(),
      timestamp: TimeUtils.toSeconds(this.timeEngine.getCurrentTime()),
      buyerId,
      sellerId,
      productId,
      quantity,
      unit,
      unitPrice,
      totalPrice,
      currency,
      transactionType,
      regionId
    };

    this.transactions.set(transaction.transactionId, transaction);

    // Emit event
    this.eventScheduler.emitter.emit('TransactionCompleted', transaction);

    return transaction;
  }

  private getWallet(entityId: string): Wallet | undefined {
    // Check citizen
    if (this.citizenWalletLookup) {
      const wallet = this.citizenWalletLookup(entityId);
      if (wallet) return wallet;
    }

    // Check workplace
    const workplace = this.worldEngine.workplaceRepository.findById(entityId);
    if (workplace && workplace.wallet) return workplace.wallet;

    return undefined;
  }

  public getTransaction(id: string): TransactionRecord | undefined {
    return this.transactions.get(id);
  }

  public getTransactionsByEntity(entityId: string): TransactionRecord[] {
    return Array.from(this.transactions.values()).filter(
      t => t.buyerId === entityId || t.sellerId === entityId
    );
  }
}
