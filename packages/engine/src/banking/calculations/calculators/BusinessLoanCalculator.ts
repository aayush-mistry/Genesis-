import { LoanTypeConfig } from '../../config/LoanConfig';
import { LoanFactor } from '../LoanFactor';
import { ILoanCalculator, BusinessLoanInputs, LoanCalculationResult } from './ILoanCalculator';

export class BusinessLoanCalculator implements ILoanCalculator {
    public calculate(inputs: BusinessLoanInputs, config: LoanTypeConfig): LoanCalculationResult {
        const Rev = Math.max(0, inputs.averageMonthlyRevenue || 0);
        const P = inputs.monthlyProfit || 0; // can be negative
        const CF = inputs.monthlyFreeCashFlow || 0; // can be negative
        const D = Math.max(0, inputs.existingMonthlyDebt);
        const A = Math.max(0, inputs.businessAssets || 0);
        const rawCreditScore = inputs.creditScore || 0;
        const C = Math.max(0, Math.min(100, ((rawCreditScore - 300) / 550) * 100));
        const S = Math.max(0, Math.min(100, inputs.businessStabilityScore || 0));
        const RepaymentHistory = Math.max(0, Math.min(100, inputs.repaymentHistoryScore));
        const R = Math.max(0, inputs.requestedAmount);
        const T = Math.max(1, inputs.requestedTermMonths);
        const BusinessMultiplier = Math.max(0, inputs.businessMultiplier || 1);
        const CashFlowHealth = Math.max(0, Math.min(100, inputs.cashFlowHealthScore || 0));
        const Profitability = Math.max(0, Math.min(100, inputs.profitabilityScore || 0));
        const AssetCoverage = Math.max(0, Math.min(100, inputs.assetCoverageScore || 0));

        const DSC = Math.max(0, CF - D);
        const EMImax = DSC * 0.40;

        const factor = LoanFactor.calculate(T, config.fixedInterestRate);
        const LoanCapacity = EMImax * factor;

        const InvestmentCapacity = Math.max(0, P) * BusinessMultiplier + 0.20 * A;
        const MaxBusinessLoan = Math.floor(Math.min(LoanCapacity, InvestmentCapacity));

        let Sb = (0.30 * CashFlowHealth) + (0.25 * Profitability) + (0.15 * S) + (0.15 * C) + (0.10 * RepaymentHistory) + (0.05 * AssetCoverage);
        Sb = Math.max(0, Math.min(100, Sb));

        const reasons: string[] = [];
        let eligible = true;

        if (rawCreditScore < config.minCreditScore) {
            eligible = false;
            reasons.push(`Credit score ${rawCreditScore} is below the minimum required ${config.minCreditScore}.`);
        }

        if (Sb < 50) {
            eligible = false;
            reasons.push(`Business eligibility score ${Sb.toFixed(2)} is too low (minimum 50).`);
        }

        if (CF <= 0 || DSC <= 0) {
            eligible = false;
            reasons.push(`Insufficient cash flow for debt service.`);
        }

        if (R > MaxBusinessLoan) {
            eligible = false;
            if (R > LoanCapacity) {
                reasons.push(`Requested amount exceeds sustainable debt capacity.`);
            } else {
                reasons.push(`Requested amount exceeds investment capacity.`);
            }
        }

        if (R > config.borrowingLimit) {
            eligible = false;
            reasons.push(`Requested amount exceeds bank limit ${config.borrowingLimit}.`);
        }

        if (T > config.maxTermMonths) {
            eligible = false;
            reasons.push(`Requested term exceeds maximum term ${config.maxTermMonths} months.`);
        }
        
        if (R <= 0) {
            eligible = false;
            reasons.push("Requested amount must be greater than zero.");
        }

        if (eligible) {
            reasons.push("Approved for Business Loan.");
        }

        return {
            eligible,
            score: Sb,
            maximumLoanAmount: Math.min(MaxBusinessLoan, config.borrowingLimit),
            maximumEmi: EMImax,
            fixedInterestRate: config.fixedInterestRate,
            termMonths: T,
            reasons
        };
    }
}
