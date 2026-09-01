import { LoanType } from '../types/BankingTypes';

export interface LoanTypeConfig {
    fixedInterestRate: number; // Annual interest rate, e.g., 0.05 for 5%
    maxTermMonths: number;
    borrowingLimit: number;
    minCreditScore: number;
}

export const LoanConfig: Record<LoanType, LoanTypeConfig> = {
    [LoanType.PERSONAL]: {
        fixedInterestRate: 0.12, // 12%
        maxTermMonths: 60,       // 5 years
        borrowingLimit: 50000,
        minCreditScore: 600,
    },
    [LoanType.EMERGENCY]: {
        fixedInterestRate: 0.08, // 8% - lower for emergencies
        maxTermMonths: 24,       // 2 years
        borrowingLimit: 10000,
        minCreditScore: 400,     // more lenient
    },
    [LoanType.BUSINESS]: {
        fixedInterestRate: 0.10, // 10%
        maxTermMonths: 120,      // 10 years
        borrowingLimit: 500000,
        minCreditScore: 650,
    },
    [LoanType.ASSET_PROPERTY]: {
        fixedInterestRate: 0.06, // 6% - backed by collateral
        maxTermMonths: 360,      // 30 years
        borrowingLimit: 1000000,
        minCreditScore: 700,
    }
};
