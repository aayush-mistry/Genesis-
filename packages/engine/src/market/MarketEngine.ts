import { TransactionRecord, TransactionType, Wallet } from '@genesis/shared';
import { EventScheduler } from '../events/EventScheduler';
import { TimeEngine } from '../time/TimeEngine';
import { TimeUtils } from '../utils/TimeUtils';
import { randomUUID } from 'crypto';
import { WorldEngine } from '../world/WorldEngine';
import { InventoryManager } from '../inventory/InventoryManager';
import { RegionalPriceAdjustment } from '@genesis/shared';

export const SYSTEM_TRANSPORT_ID = 'SYSTEM_TRANSPORT';
export const TRANSPORT_TREASURY_WALLET_ID = 'wallet-system-transport';

export class MarketEngine {
  public static readonly TRANSPORT_TREASURY_OWNER_ID = SYSTEM_TRANSPORT_ID;
  public static readonly TRANSPORT_TREASURY_WALLET_ID = TRANSPORT_TREASURY_WALLET_ID;

  private transactions: Map<string, TransactionRecord> = new Map();

  constructor(
    private worldEngine: WorldEngine,
    private timeEngine: TimeEngine,
    private eventScheduler: EventScheduler,
    private citizenWalletLookup?: (citizenId: string) => Wallet | undefined
  ) {
    this.getOrCreateTransportTreasuryWallet();
  }

  private regionalAdjustments: Map<string, RegionalPriceAdjustment> = new Map();
  private priceFormationService?: import('./PriceFormationService').PriceFormationService;

  public setPriceFormationService(service: import('./PriceFormationService').PriceFormationService): void {
    this.priceFormationService = service;
  }

  public getPriceFormationService(): import('./PriceFormationService').PriceFormationService | undefined {
    return this.priceFormationService;
  }

  public setRegionalAdjustment(adjustment: RegionalPriceAdjustment): void {
    this.regionalAdjustments.set(`${adjustment.regionId}-${adjustment.productId}`, adjustment);
  }

  public getRegionalAdjustment(regionId: string, productId: string): RegionalPriceAdjustment | undefined {
    return this.regionalAdjustments.get(`${regionId}-${productId}`);
  }

  public calculateEffectivePrice(productId: string, regionId: string, basePrice: number): number {
    const adjustment = this.regionalAdjustments.get(`${regionId}-${productId}`);
    const regionalMultiplier = adjustment ? adjustment.adjustmentMultiplier : 1.0;
    const regionalOffset = adjustment ? adjustment.adjustmentOffset : 0.0;

    if (this.priceFormationService) {
      const breakdown = this.priceFormationService.calculatePrice(
        productId,
        regionId,
        regionalMultiplier,
        regionalOffset
      );
      return breakdown.retailPrice;
    }

    if (!adjustment) return basePrice;
    return Math.max(0, (basePrice * adjustment.adjustmentMultiplier) + adjustment.adjustmentOffset);
  }

  public getPriceBreakdown(
    productId: string,
    regionId: string = 'DEFAULT',
    requestedQuantity: number = 1
  ): {
    productId: string;
    regionId: string;
    referencePrice: number;
    retailPrice: number;
    wholesaleUnitPrice: number;
    scarcitySurplusFactor: number;
    regionalFactor: number;
    unit: string;
    currency: string;
  } {
    const adjustment = this.regionalAdjustments.get(`${regionId}-${productId}`);
    const regionalMultiplier = adjustment ? adjustment.adjustmentMultiplier : 1.0;
    const regionalOffset = adjustment ? adjustment.adjustmentOffset : 0.0;

    if (this.priceFormationService) {
      const breakdown = this.priceFormationService.calculatePrice(
        productId,
        regionId,
        regionalMultiplier,
        regionalOffset,
        requestedQuantity
      );
      return {
        productId,
        regionId,
        referencePrice: breakdown.referencePrice,
        retailPrice: breakdown.retailPrice,
        wholesaleUnitPrice: breakdown.wholesaleUnitPrice,
        scarcitySurplusFactor: breakdown.scarcitySurplusFactor,
        regionalFactor: breakdown.regionalFactor,
        unit: productId === 'water' ? 'L' : 'kg',
        currency: 'INR'
      };
    }

    const effective = this.calculateEffectivePrice(productId, regionId, 10);
    return {
      productId,
      regionId,
      referencePrice: 10,
      retailPrice: effective,
      wholesaleUnitPrice: parseFloat((effective * 0.85).toFixed(2)),
      scarcitySurplusFactor: 1.0,
      regionalFactor: regionalMultiplier,
      unit: productId === 'water' ? 'L' : 'kg',
      currency: 'INR'
    };
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
    regionId: string,
    transactionId?: string
  ): TransactionRecord | null {
    // 1. Idempotency check: Return existing transaction if already processed
    if (transactionId && this.transactions.has(transactionId)) {
      return this.transactions.get(transactionId)!;
    }

    // Basic validation
    if (totalPrice < 0) return null;

    // We need to fetch wallets. Since buyer/seller can be Citizens or Workplaces or Utilities,
    // we need to look them up through real wallet infrastructure.
    let buyerWallet = this.getWallet(buyerId);
    let sellerWallet = this.getWallet(sellerId);

    // If it's a purchase/expense/wage, buyer must have enough funds if wallet is present.
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

    // Inventory transfer is now managed by the caller (e.g. PurchaseActionExecutor or SupplyChainEngine)
    // to prevent double-deduction and teleportation of resources.

    const transaction: TransactionRecord = {
      transactionId: transactionId || randomUUID(),
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

  private reversedTransactionIds: Set<string> = new Set();

  public hasTransaction(id: string): boolean {
    return this.transactions.has(id);
  }

  public isTransactionReversed(id: string): boolean {
    return this.reversedTransactionIds.has(id);
  }

  public loadTransactions(transactions: TransactionRecord[]): void {
    for (const tx of transactions) {
      if (tx && tx.transactionId && !this.transactions.has(tx.transactionId)) {
        this.transactions.set(tx.transactionId, tx);
        if (tx.referenceType === 'TRANSACTION_REVERSAL' && tx.referenceId) {
          this.reversedTransactionIds.add(tx.referenceId);
        }
      }
    }
  }

  /**
   * Idempotently reverses a completed transaction.
   * Restores buyer balance and decrements seller balance, adjusting income/expenses.
   * If reversalTransactionId has already been processed, returns the existing reversal record
   * without mutating wallets again.
   */
  public reverseTransaction(
    originalTransactionId: string,
    reversalTransactionId: string,
    reason?: string
  ): TransactionRecord | null {
    // 1. Idempotency: Return existing reversal if already processed
    if (this.transactions.has(reversalTransactionId)) {
      return this.transactions.get(reversalTransactionId)!;
    }

    const orig = this.transactions.get(originalTransactionId);
    if (!orig) {
      console.warn(`[MarketEngine] Cannot reverse unknown transaction: ${originalTransactionId}`);
      return null;
    }

    // Check if original transaction has already been reversed under a different ID
    if (this.reversedTransactionIds.has(originalTransactionId)) {
      console.warn(`[MarketEngine] Transaction ${originalTransactionId} has already been reversed.`);
      return null;
    }

    let buyerWallet = this.getWallet(orig.buyerId);
    let sellerWallet = this.getWallet(orig.sellerId);

    // If money was transferred (totalPrice > 0), ensure wallets exist and seller has sufficient funds.
    if (orig.totalPrice > 0) {
      if (!sellerWallet) {
        console.warn(`[MarketEngine] Reversal rejected: Seller wallet '${orig.sellerId}' not found for transaction ${originalTransactionId}`);
        return null;
      }
      if (!buyerWallet) {
        console.warn(`[MarketEngine] Reversal rejected: Buyer wallet '${orig.buyerId}' not found for transaction ${originalTransactionId}`);
        return null;
      }
      if (sellerWallet.balance < orig.totalPrice) {
        console.warn(
          `[MarketEngine] Reversal rejected: Insufficient funds in seller wallet '${orig.sellerId}' ` +
          `(balance: ${sellerWallet.balance}, required: ${orig.totalPrice}) for transaction ${originalTransactionId}`
        );
        return null;
      }
    }

    // Reversal transfer: refund funds from seller back to buyer
    if (sellerWallet) {
      sellerWallet.balance -= orig.totalPrice;
      sellerWallet.totalIncome = Math.max(0, sellerWallet.totalIncome - orig.totalPrice);
    }

    if (buyerWallet) {
      buyerWallet.balance += orig.totalPrice;
      buyerWallet.totalExpenses = Math.max(0, buyerWallet.totalExpenses - orig.totalPrice);
    }

    const reversalTx: TransactionRecord = {
      transactionId: reversalTransactionId,
      timestamp: TimeUtils.toSeconds(this.timeEngine.getCurrentTime()),
      buyerId: orig.sellerId,
      sellerId: orig.buyerId,
      productId: orig.productId,
      quantity: orig.quantity,
      unit: orig.unit,
      unitPrice: orig.unitPrice,
      totalPrice: orig.totalPrice,
      currency: orig.currency,
      transactionType: TransactionType.TRANSFER,
      regionId: orig.regionId,
      description: reason || `Reversal of transaction ${originalTransactionId}`,
      referenceId: originalTransactionId,
      referenceType: 'TRANSACTION_REVERSAL'
    };

    this.reversedTransactionIds.add(originalTransactionId);
    this.transactions.set(reversalTransactionId, reversalTx);

    // Emit event so persistence / analytics capture the reversal
    this.eventScheduler.emitter.emit('TransactionCompleted', reversalTx);

    return reversalTx;
  }

  private customWalletLookup?: (entityId: string) => Wallet | undefined;
  private registeredWallets: Map<string, Wallet> = new Map();

  public registerWallet(wallet: Wallet): void {
    this.registeredWallets.set(wallet.ownerId, wallet);
  }

  public setCustomWalletLookup(lookup: (entityId: string) => Wallet | undefined): void {
    this.customWalletLookup = lookup;
  }

  public getOrCreateTransportTreasuryWallet(): Wallet {
    let wallet = this.registeredWallets.get(MarketEngine.TRANSPORT_TREASURY_OWNER_ID);
    if (!wallet) {
      wallet = {
        id: MarketEngine.TRANSPORT_TREASURY_WALLET_ID,
        ownerId: MarketEngine.TRANSPORT_TREASURY_OWNER_ID,
        balance: 0,
        currency: 'GEN',
        totalIncome: 0,
        totalExpenses: 0
      };
      this.registeredWallets.set(MarketEngine.TRANSPORT_TREASURY_OWNER_ID, wallet);
    }
    return wallet;
  }

  public getTransportTreasuryWallet(): Wallet {
    return this.getOrCreateTransportTreasuryWallet();
  }

  public getOrCreateUtilityWallet(regionId: string): Wallet {
    const utilityOwnerId = `utility-water-${regionId}`;
    let wallet = this.registeredWallets.get(utilityOwnerId);
    if (!wallet) {
      wallet = {
        id: `wallet-${utilityOwnerId}`,
        ownerId: utilityOwnerId,
        balance: 0,
        currency: 'GEN',
        totalIncome: 0,
        totalExpenses: 0
      };
      this.registeredWallets.set(utilityOwnerId, wallet);
    }
    return wallet;
  }

  public getRegisteredWallets(): Wallet[] {
    return Array.from(this.registeredWallets.values());
  }

  public getWallet(entityId: string): Wallet | undefined {
    // Check citizen
    if (this.citizenWalletLookup) {
      const wallet = this.citizenWalletLookup(entityId);
      if (wallet) return wallet;
    }

    // Check workplace
    const workplace = this.worldEngine.workplaceRepository.findById(entityId);
    if (workplace && workplace.wallet) return workplace.wallet;

    // Check registered wallets (e.g. municipal utility accounts, transport treasury)
    if (this.registeredWallets.has(entityId)) {
      return this.registeredWallets.get(entityId);
    }

    if (entityId === MarketEngine.TRANSPORT_TREASURY_OWNER_ID || entityId === MarketEngine.TRANSPORT_TREASURY_WALLET_ID) {
      return this.getOrCreateTransportTreasuryWallet();
    }

    // Also support lookup by wallet.id if registered
    for (const w of this.registeredWallets.values()) {
      if (w.id === entityId) return w;
    }

    // Check custom wallet lookup
    if (this.customWalletLookup) {
      const wallet = this.customWalletLookup(entityId);
      if (wallet) return wallet;
    }

    return undefined;
  }

  private getInventoryId(entityId: string): string | undefined {
    if (entityId.startsWith('citizen-')) {
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

  public getAllTransactions(): TransactionRecord[] {
    return Array.from(this.transactions.values());
  }

  public getTransactionsByEntity(entityId: string): TransactionRecord[] {
    return Array.from(this.transactions.values()).filter(
      t => t.buyerId === entityId || t.sellerId === entityId
    );
  }

  public clear(): void {
    this.transactions.clear();
    this.reversedTransactionIds.clear();
    this.registeredWallets.clear();
    this.regionalAdjustments.clear();
    this.getOrCreateTransportTreasuryWallet();
  }

  public reset(): void {
    this.clear();
  }
}

