import { TransactionRecord, TransactionType } from '@genesis/shared';
import { randomUUID } from 'crypto';

export class TransactionLedger {
  private transactions: Map<string, TransactionRecord> = new Map();

  public recordTransaction(transaction: TransactionRecord): void {
    if (!transaction.transactionId) {
      transaction.transactionId = randomUUID();
    }
    this.transactions.set(transaction.transactionId, transaction);
  }

  public getTransaction(id: string): TransactionRecord | undefined {
    return this.transactions.get(id);
  }

  public getTransactionsByEntity(entityId: string): TransactionRecord[] {
    return Array.from(this.transactions.values()).filter(
      t => t.buyerId === entityId || t.sellerId === entityId
    );
  }

  public getTransactionsInPeriod(startTime: number, endTime: number): TransactionRecord[] {
    return Array.from(this.transactions.values()).filter(
      t => t.timestamp >= startTime && t.timestamp <= endTime
    );
  }

  public getAllTransactions(): TransactionRecord[] {
    return Array.from(this.transactions.values());
  }
}
