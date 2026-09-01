import { LoanTypeConfig } from '../../config/LoanConfig';
import { LoanFactor } from '../LoanFactor';
import { ILoanCalculator, AssetPropertyLoanInputs, LoanCalculationResult } from './ILoanCalculator';

export class AssetPropertyLoanCalculator implements ILoanCalculator {
    public calculate(inputs: AssetPropertyLoanInputs, config: LoanTypeConfig): LoanCalculationResult {
        const V = Math.max(0, inputs.verifiedPropertyValue || 0);
        const DP = Math.max(0, inputs.downPayment || 0);
        const LTV = Math.max(0, Math.min(1, inputs.maxLoanToValueRatio || 0.8));
        const I = Math.max(0, inputs.monthlyIncome);
        const D = Math.max(0, inputs.existingMonthlyDebt);
        const rawCreditScore = inputs.creditScore || 0;
        const C = Math.max(0, Math.min(100, ((rawCreditScore - 300) / 550) * 100));
        const Q = Math.max(0, Math.min(100, inputs.assetQualityScore || 0));
        const IncomeStability = Math.max(0, Math.min(100, inputs.employmentStabilityScore));
        const RepaymentHistory = Math.max(0, Math.min(100, inputs.repaymentHistoryScore));
        const CollateralCoverage = Math.max(0, Math.min(100, inputs.collateralCoverageScore || 0));
        const R = Math.max(0, inputs.requestedAmount);
        const T = Math.max(1, inputs.requestedTermMonths);

        const CollateralLimit = Math.max(0, (V - DP) * LTV);
        const EMImax = Math.max(0, I - D) * 0.40;

        const factor = LoanFactor.calculate(T, config.fixedInterestRate);
        const IncomeLoanLimit = EMImax * factor;

        const MaxAssetLoan = Math.floor(Math.min(CollateralLimit, IncomeLoanLimit));

        let Sa = (0.35 * CollateralCoverage) + (0.25 * C) + (0.20 * IncomeStability) + (0.10 * RepaymentHistory) + (0.10 * Q);
        Sa = Math.max(0, Math.min(100, Sa));

        const reasons: string[] = [];
        let eligible = true;

        if (rawCreditScore < config.minCreditScore) {
            eligible = false;
            reasons.push(`Credit score ${rawCreditScore} is below the minimum required ${config.minCreditScore}.`);
        }

        if (Sa < 50) {
            eligible = false;
            reasons.push(`Asset loan eligibility score ${Sa.toFixed(2)} is too low (minimum 50).`);
        }

        if (R > MaxAssetLoan) {
            eligible = false;
            if (R > CollateralLimit) {
                reasons.push(`Requested amount exceeds collateral limit.`);
            } else {
                reasons.push(`Requested amount exceeds income-based limit.`);
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
            reasons.push("Approved for Asset/Property Loan.");
        }

        return {
            eligible,
            score: Sa,
            maximumLoanAmount: Math.min(MaxAssetLoan, config.borrowingLimit),
            maximumEmi: EMImax,
            fixedInterestRate: config.fixedInterestRate,
            termMonths: T,
            reasons
        };
    }
}
