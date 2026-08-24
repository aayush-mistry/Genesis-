import { TransactionRecord, TransactionType, Wallet } from '@genesis/shared';
import { EventScheduler } from '../events/EventScheduler';
import { TimeEngine } from '../time/TimeEngine';
import { TimeUtils } from '../utils/TimeUtils';
import { randomUUID } from 'crypto';
import { WorldEngine } from '../world/WorldEngine';
import { InventoryManager } from '../inventory/InventoryManager';
import { RegionalPriceAdjustment } from '@genesis/shared';

export class MarketEngine {
  private transactions: Map<string, TransactionRecord> = new Map();

  constructor(
    private worldEngine: WorldEngine,
    private timeEngine: TimeEngine,
    private eventScheduler: EventScheduler,
    private citizenWalletLookup?: (citizenId: string) => Wallet | undefined,
    private inventoryManager?: InventoryManager,
    private citizenInventoryLookup?: (citizenId: string) => string | undefined
  ) {}

  private regionalAdjustments: Map<string, RegionalPriceAdjustment> = new Map();

  public setRegionalAdjustment(adjustment: RegionalPriceAdjustment): void {
    this.regionalAdjustments.set(`${adjustment.regionId}-${adjustment.productId}`, adjustment);
  }

  public calculateEffectivePrice(productId: string, regionId: string, basePrice: number): number {
    const adjustment = this.regionalAdjustments.get(`${regionId}-${productId}`);
    if (!adjustment) return basePrice;
    return Math.max(0, (basePrice * adjustment.adjustmentMultiplier) + adjustment.adjustmentOffset);
  }

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

    // Handle inventory if goods are involved
    if (productId && quantity && this.inventoryManager) {
      const sellerInvId = this.getInventoryId(sellerId);
      const buyerInvId = this.getInventoryId(buyerId);

      if (sellerInvId) {
        // Decrement seller
        this.inventoryManager.removeItemQuantity(sellerInvId, productId, quantity);
      }
      if (buyerInvId) {
        // Increment buyer
        // Need to ensure inventory exists. In Genesis, createInventory might be needed.
        if (!this.inventoryManager.getInventory(buyerInvId)) {
          this.inventoryManager.createInventory(buyerInvId, buyerId, 100); // default capacity for citizen/entity
        }
        this.inventoryManager.addItemQuantity(buyerInvId, productId, quantity, unit || 'kg');
      }
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

  private getInventoryId(entityId: string): string | undefined {
    // Check citizen
    if (this.citizenInventoryLookup) {
      const invId = this.citizenInventoryLookup(entityId);
      if (invId) return invId;
    } else if (entityId.startsWith('citizen-')) {
      return `inv-${entityId}`;
    }

    // Check workplace
    const workplace = this.worldEngine.workplaceRepository.findById(entityId);
    if (workplace && workplace.inventoryId) return workplace.inventoryId;

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
