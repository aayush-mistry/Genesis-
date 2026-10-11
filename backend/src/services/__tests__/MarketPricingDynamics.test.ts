import { prisma } from '../../repositories/prisma';
import { worldService } from '../world.service';
import { marketService } from '../market.service';
import { supplyService } from '../supply.service';
import { civilizationIntelligenceService } from '../civilizationIntelligence.service';
import { persistenceService } from '../persistence.service';

describe('Market & Price Dynamics Integration (T7.8.4)', () => {
  jest.setTimeout(45000);

  beforeAll(async () => {
    supplyService.initialize();
    marketService.initialize();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('1. Computes valid retail, wholesale, and reference prices for commodities', async () => {
    const wheatPrice = marketService.engine.getPriceBreakdown('wheat');
    expect(wheatPrice.productId).toBe('wheat');
    expect(wheatPrice.referencePrice).toBe(10);
    expect(wheatPrice.retailPrice).toBeGreaterThanOrEqual(1);
    expect(wheatPrice.wholesaleUnitPrice).toBeLessThanOrEqual(wheatPrice.retailPrice);
    expect(wheatPrice.currency).toBe('INR');
    expect(wheatPrice.unit).toBe('kg');

    const waterPrice = marketService.engine.getPriceBreakdown('water');
    expect(waterPrice.productId).toBe('water');
    expect(waterPrice.referencePrice).toBe(2);
    expect(waterPrice.unit).toBe('L');
  });

  it('2. Reflects market pricing within CivilizationSummary', async () => {
    const summary = await civilizationIntelligenceService.getCivilizationSummary();
    expect(summary).toHaveProperty('market');
    expect(summary.market).toHaveProperty('wheat');
    expect(summary.market).toHaveProperty('water');
    expect(summary.market.wheat.retailPrice).toBeDefined();
    expect(summary.market.wheat.currency).toBe('INR');
  });

  it('3. Retains historical transaction price across subsequent market price updates', async () => {
    const txId = `test-tx-${Date.now()}`;
    const tx = await prisma.transactionRecord.create({
      data: {
        transactionId: txId,
        timestamp: 1000,
        buyerId: 'buyer-cit-1',
        sellerId: 'seller-shop-1',
        productId: 'wheat',
        quantity: 5,
        unit: 'kg',
        unitPrice: 10.0,
        totalPrice: 50.0,
        currency: 'INR',
        transactionType: 'PURCHASE',
        regionId: 'reg-hist'
      }
    });

    expect(tx.unitPrice).toBe(10.0);
    expect(tx.totalPrice).toBe(50.0);

    // Apply a regional multiplier that changes current market price
    marketService.engine.setRegionalAdjustment({
      regionId: 'reg-hist',
      productId: 'wheat',
      adjustmentMultiplier: 1.5,
      adjustmentOffset: 0
    });

    const newCurrentPrice = marketService.engine.calculateEffectivePrice('wheat', 'reg-hist', 10);
    expect(newCurrentPrice).toBe(15.0);

    // Verify historical transaction in DB remains untouched
    const historicalTx = await prisma.transactionRecord.findUnique({
      where: { transactionId: txId }
    });
    expect(historicalTx?.unitPrice).toBe(10.0);
    expect(historicalTx?.totalPrice).toBe(50.0);
  });

  it('4. Prices and state recover consistently after simulation re-initialization (restart)', async () => {
    // Re-initialize market engine and verify pricing does not drift or compound
    marketService.initialize();
    const wheatPriceAfterRestart = marketService.engine.getPriceBreakdown('wheat');
    expect(wheatPriceAfterRestart.referencePrice).toBe(10);
    expect(wheatPriceAfterRestart.retailPrice).toBeGreaterThanOrEqual(1);
  });
});
