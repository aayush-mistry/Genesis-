export interface Wallet {
  id: string;
  ownerId: string;
  balance: number;
  currency: string;
  totalIncome: number;
  totalExpenses: number;
}

export enum TransactionType {
  PURCHASE = 'PURCHASE',
  SALE = 'SALE',
  WAGE = 'WAGE',
  EXPENSE = 'EXPENSE',
  TRANSFER = 'TRANSFER'
}

export interface TransactionRecord {
  transactionId: string;
  timestamp: number;
  buyerId: string;
  sellerId: string;
  productId: string | null;
  quantity: number | null;
  unit: string | null;
  unitPrice: number | null;
  totalPrice: number;
  currency: string;
  transactionType: TransactionType;
  regionId: string;
}

export interface RegionalMarketState {
  regionId: string;
  productId: string;
  currentPrice: number;
  dailySupply: number;
  dailyDemand: number;
  deficit: number;
  surplus: number;
  lastUpdated: number;
}

export interface RegionalPriceAdjustment {
  regionId: string;
  productId: string;
  adjustmentMultiplier: number;
  adjustmentOffset: number;
}
