import { prisma } from './prisma';

export class FinancialRepository {
  async createWallet(ownerId: string, currency: string = 'CREDIT') {
    return prisma.wallet.create({
      data: {
        ownerId,
        currency,
        balance: 0,
      }
    });
  }

  async getWalletByOwner(ownerId: string) {
    return prisma.wallet.findUnique({
      where: { ownerId }
    });
  }

  async listWallets() {
    return prisma.wallet.findMany();
  }

  async executeTransfer(buyerId: string, sellerId: string, amount: number, details: any) {
    return prisma.$transaction(async (tx) => {
      const buyer = await tx.wallet.update({
        where: { ownerId: buyerId },
        data: { balance: { decrement: amount }, totalExpenses: { increment: amount } }
      });

      const seller = await tx.wallet.update({
        where: { ownerId: sellerId },
        data: { balance: { increment: amount }, totalIncome: { increment: amount } }
      });

      const record = await tx.transactionRecord.create({
        data: {
          transactionId: details.transactionId,
          timestamp: details.timestamp,
          buyerId,
          sellerId,
          totalPrice: amount,
          currency: buyer.currency,
          transactionType: details.transactionType,
          regionId: details.regionId,
          productId: details.productId,
          quantity: details.quantity,
          unit: details.unit,
        }
      });

      return { buyer, seller, record };
    });
  }
}

export const financialRepository = new FinancialRepository();
