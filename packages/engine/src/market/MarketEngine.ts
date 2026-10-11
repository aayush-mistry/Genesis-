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
    private citizenWalletLookup?: (citizenId: string) => Wallet | undefined
  ) {}

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

  public getTransactionsByEntity(entityId: string): TransactionRecord[] {
    return Array.from(this.transactions.values()).filter(
      t => t.buyerId === entityId || t.sellerId === entityId
    );
  }
}
