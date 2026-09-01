import { LoanTypeConfig } from '../../config/LoanConfig';
import { LoanFactor } from '../LoanFactor';
import { ILoanCalculator, PersonalLoanInputs, LoanCalculationResult } from './ILoanCalculator';

export class PersonalLoanCalculator implements ILoanCalculator {
    public calculate(inputs: PersonalLoanInputs, config: LoanTypeConfig): LoanCalculationResult {
        const I = Math.max(0, inputs.monthlyIncome);
        const D = Math.max(0, inputs.existingMonthlyDebt);
        const E = Math.max(0, Math.min(100, inputs.employmentStabilityScore));
        const rawCreditScore = inputs.creditScore || 0;
        const C = Math.max(0, Math.min(100, ((rawCreditScore - 300) / 550) * 100));
        const A = Math.max(0, inputs.availableAssets);
        const R = Math.max(0, inputs.requestedAmount);
        const T = Math.max(1, inputs.requestedTermMonths);
        const H = Math.max(0, Math.min(100, inputs.repaymentHistoryScore));

        const DI = Math.max(0, I - D);
        const EMImax = DI * 0.35;

        let incomeRatio = 0;
        if (I > 0) {
            incomeRatio = (DI / I) * 100;
        }

        let assetRatio = 0;
        if ((A + R) > 0) {
            assetRatio = (A / (A + R)) * 100;
        }

        let Sp = (0.35 * C) + (0.25 * E) + (0.20 * incomeRatio) + (0.10 * assetRatio) + (0.10 * H);
        Sp = Math.max(0, Math.min(100, Sp));

        const factor = LoanFactor.calculate(T, config.fixedInterestRate);
        const maxLoan = Math.floor(EMImax * factor);

        const reasons: string[] = [];
        let eligible = true;

        if (rawCreditScore < config.minCreditScore) {
            eligible = false;
            reasons.push(`Credit score ${rawCreditScore} is below the minimum required ${config.minCreditScore}.`);
        }

        if (Sp < 50) {
            eligible = false;
            reasons.push(`Eligibility score ${Sp.toFixed(2)} is too low (minimum 50).`);
        }

        if (R > maxLoan) {
            eligible = false;
            reasons.push(`Requested amount ${R} exceeds maximum affordable loan ${maxLoan}.`);
        }

        if (R > config.borrowingLimit) {
            eligible = false;
            reasons.push(`Requested amount ${R} exceeds bank limit ${config.borrowingLimit}.`);
        }

        if (T > config.maxTermMonths) {
            eligible = false;
            reasons.push(`Requested term ${T} months exceeds maximum term ${config.maxTermMonths} months.`);
        }

        if (R <= 0) {
            eligible = false;
            reasons.push("Requested amount must be greater than zero.");
        }

        if (eligible) {
            reasons.push("Approved for Personal Loan.");
        }

        return {
            eligible,
            score: Sp,
            maximumLoanAmount: Math.min(maxLoan, config.borrowingLimit),
            maximumEmi: EMImax,
            fixedInterestRate: config.fixedInterestRate,
            termMonths: T,
            reasons
        };
    }
}
