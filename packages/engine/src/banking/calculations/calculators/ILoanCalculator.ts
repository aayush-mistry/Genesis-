import { LoanTypeConfig } from '../../config/LoanConfig';

export interface BaseLoanInputs {
    monthlyIncome: number;
    existingMonthlyDebt: number;
    employmentStabilityScore: number;
    creditScore: number;
    repaymentHistoryScore: number;
    availableAssets: number;
    requestedAmount: number;
    requestedTermMonths: number;
}

export interface PersonalLoanInputs extends BaseLoanInputs {}

export interface EmergencyLoanInputs extends BaseLoanInputs {
    emergencyNecessityScore: number;
    essentialExpense: number;
}

export interface BusinessLoanInputs extends BaseLoanInputs {
    averageMonthlyRevenue: number;
    monthlyProfit: number;
    monthlyFreeCashFlow: number;
    businessStabilityScore: number;
    businessAssets: number;
    businessMultiplier: number;
    cashFlowHealthScore: number;
    profitabilityScore: number;
    assetCoverageScore: number;
}

export interface AssetPropertyLoanInputs extends BaseLoanInputs {
    verifiedPropertyValue: number;
    downPayment: number;
    maxLoanToValueRatio: number;
    assetQualityScore: number;
    collateralCoverageScore: number;
}

export type AnyLoanInputs = Partial<EmergencyLoanInputs & BusinessLoanInputs & AssetPropertyLoanInputs> & BaseLoanInputs;

export interface LoanCalculationResult {
    eligible: boolean;
    score: number;
    maximumLoanAmount: number;
    maximumEmi: number;
    fixedInterestRate: number;
    termMonths: number;
    reasons: string[];
}

export interface ILoanCalculator {
    calculate(inputs: AnyLoanInputs, config: LoanTypeConfig): LoanCalculationResult;
}
