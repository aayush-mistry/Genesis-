import { LoanType, EligibilityResult } from '../types/BankingTypes';
import { LoanConfig } from '../config/LoanConfig';
import { EMICalculator } from './EMICalculator';

export interface ApplicantFinancials {
    incomeOrRevenue: number;
    existingDebt: number;
    existingEmiBurden: number;
    creditScore: number;
    employmentDurationMonths?: number;
    businessStabilityMonths?: number;
    cashFlow?: number;
}

export class LoanEligibilityCalculator {
    static evaluateEligibility(
        loanType: LoanType,
        requestedAmount: number,
        requestedTermMonths: number,
        financials: ApplicantFinancials
    ): EligibilityResult {
        const config = LoanConfig[loanType];
        const reasons: string[] = [];
        let score = 100;
        let eligible = true;

        // 1. Basic configuration checks
        if (requestedAmount > config.borrowingLimit) {
            eligible = false;
            reasons.push(`Requested amount exceeds limit of ${config.borrowingLimit} for ${loanType}`);
            score -= 50;
        }

        if (requestedTermMonths > config.maxTermMonths) {
            eligible = false;
            reasons.push(`Requested term exceeds maximum of ${config.maxTermMonths} months for ${loanType}`);
            score -= 20;
        }

        if (financials.creditScore < config.minCreditScore) {
            eligible = false;
            reasons.push(`Credit score ${financials.creditScore} is below minimum requirement of ${config.minCreditScore}`);
            score -= 40;
        }

        // 2. EMI Burden & Affordability Check
        const proposedEmi = EMICalculator.calculateMonthlyEMI(requestedAmount, config.fixedInterestRate, requestedTermMonths);
        const totalFutureEmi = financials.existingEmiBurden + proposedEmi;
        const monthlyIncome = financials.incomeOrRevenue / 12; // Assuming incomeOrRevenue is annual
        
        // Debt-to-Income (DTI) ratio
        const dtiRatio = monthlyIncome > 0 ? totalFutureEmi / monthlyIncome : Infinity;

        // Max DTI ratios based on loan type
        const maxDtiMap: Record<LoanType, number> = {
            [LoanType.PERSONAL]: 0.40,
            [LoanType.EMERGENCY]: 0.60,
            [LoanType.BUSINESS]: 0.50,
            [LoanType.ASSET_PROPERTY]: 0.45
        };

        const maxDti = maxDtiMap[loanType];

        if (dtiRatio > maxDti) {
            eligible = false;
            reasons.push(`Debt-to-Income ratio would be ${(dtiRatio * 100).toFixed(1)}% (exceeds ${maxDti * 100}%)`);
            score -= Math.min(30, (dtiRatio - maxDti) * 100);
        } else {
            score += 20; // Good DTI
        }

        // 3. Stability Checks
        if (loanType === LoanType.PERSONAL || loanType === LoanType.ASSET_PROPERTY) {
            if (financials.employmentDurationMonths !== undefined && financials.employmentDurationMonths < 6) {
                reasons.push(`Employment duration of ${financials.employmentDurationMonths} months is a risk factor (preferred 6+)`);
                score -= 15;
                if (loanType === LoanType.ASSET_PROPERTY) eligible = false;
            }
        }

        if (loanType === LoanType.BUSINESS) {
            if (financials.businessStabilityMonths !== undefined && financials.businessStabilityMonths < 12) {
                eligible = false;
                reasons.push(`Business must be stable for at least 12 months for a BUSINESS loan`);
                score -= 30;
            }
            if (financials.cashFlow !== undefined && financials.cashFlow < proposedEmi * 1.2) { // 1.2 DSCR
                eligible = false;
                reasons.push(`Insufficient business cash flow to cover the proposed EMI (Debt Service Coverage Ratio < 1.2)`);
                score -= 25;
            }
        }

        // Calculate maximum eligible amount based on max DTI
        let maximumEligibleAmount = 0;
        if (monthlyIncome > 0) {
            const maxAffordableEmi = (monthlyIncome * maxDti) - financials.existingEmiBurden;
            if (maxAffordableEmi > 0) {
                // Reverse EMI formula to find Principal: P = (E * ((1 + r)^n - 1)) / (r * (1 + r)^n)
                const r = config.fixedInterestRate / 12;
                const n = requestedTermMonths;
                if (r > 0) {
                    const num = Math.pow(1 + r, n) - 1;
                    const den = r * Math.pow(1 + r, n);
                    maximumEligibleAmount = maxAffordableEmi * (num / den);
                } else {
                    maximumEligibleAmount = maxAffordableEmi * n;
                }
                maximumEligibleAmount = Math.min(maximumEligibleAmount, config.borrowingLimit);
                maximumEligibleAmount = Math.floor(maximumEligibleAmount);
            }
        }

        score = Math.max(0, Math.min(100, score));

        if (eligible) {
            reasons.push('Eligibility requirements met.');
        }

        return {
            eligible,
            score,
            maximumEligibleAmount,
            reasons
        };
    }
}
