import { LoanTypeConfig } from '../../config/LoanConfig';
import { LoanFactor } from '../LoanFactor';
import { ILoanCalculator, EmergencyLoanInputs, LoanCalculationResult } from './ILoanCalculator';

export class EmergencyLoanCalculator implements ILoanCalculator {
    public calculate(inputs: EmergencyLoanInputs, config: LoanTypeConfig): LoanCalculationResult {
        const N = Math.max(0, Math.min(100, inputs.emergencyNecessityScore || 0));
        const EssentialExpense = Math.max(0, inputs.essentialExpense || 0);
        const I = Math.max(0, inputs.monthlyIncome);
        const D = Math.max(0, inputs.existingMonthlyDebt);
        const rawCreditScore = inputs.creditScore || 0;
        const C = Math.max(0, Math.min(100, ((rawCreditScore - 300) / 550) * 100));
        const IncomeStability = Math.max(0, Math.min(100, inputs.employmentStabilityScore));
        const RepaymentHistory = Math.max(0, Math.min(100, inputs.repaymentHistoryScore));
        const R = Math.max(0, inputs.requestedAmount);
        const T = Math.max(1, inputs.requestedTermMonths);

        const EmergencyNeed = EssentialExpense * (N / 100);
        const RepaymentCapacityEMI = Math.max(0, I - D) * 0.50;

        const factor = LoanFactor.calculate(T, config.fixedInterestRate);
        const maxAffordableLoan = RepaymentCapacityEMI * factor;

        const maxEmergencyLoan = Math.floor(Math.min(EmergencyNeed, maxAffordableLoan));

        let Se = (0.45 * N) + (0.20 * C) + (0.20 * IncomeStability) + (0.15 * RepaymentHistory);
        Se = Math.max(0, Math.min(100, Se));

        const reasons: string[] = [];
        let eligible = true;

        if (rawCreditScore < config.minCreditScore) {
            eligible = false;
            reasons.push(`Credit score ${rawCreditScore} is below the minimum required ${config.minCreditScore}.`);
        }

        if (Se < 50) {
            eligible = false;
            reasons.push(`Emergency eligibility score ${Se.toFixed(2)} is too low (minimum 50).`);
        }

        if (EmergencyNeed <= 0) {
            eligible = false;
            reasons.push(`Insufficient emergency need.`);
        }

        if (R > maxEmergencyLoan) {
            eligible = false;
            if (R > EmergencyNeed) {
                reasons.push(`Requested amount exceeds emergency requirement (${EmergencyNeed.toFixed(2)}).`);
            } else {
                reasons.push(`Repayment capacity too low for the requested amount.`);
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
            reasons.push("Approved for Emergency Loan.");
        }

        return {
            eligible,
            score: Se,
            maximumLoanAmount: Math.min(maxEmergencyLoan, config.borrowingLimit),
            maximumEmi: RepaymentCapacityEMI,
            fixedInterestRate: config.fixedInterestRate,
            termMonths: T,
            reasons
        };
    }
}
