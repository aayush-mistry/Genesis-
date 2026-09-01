export class EMICalculator {
    /**
     * Calculates the monthly EMI for a loan.
     * Uses the standard formula: E = P * r * (1 + r)^n / ((1 + r)^n - 1)
     * Where:
     * P = Principal
     * r = Monthly interest rate (Annual Rate / 12)
     * n = Term in months
     */
    static calculateMonthlyEMI(principal: number, annualInterestRate: number, termMonths: number): number {
        if (principal <= 0 || termMonths <= 0) return 0;
        
        if (annualInterestRate === 0) {
            return principal / termMonths;
        }

        const r = annualInterestRate / 12;
        const n = termMonths;
        
        const numerator = principal * r * Math.pow(1 + r, n);
        const denominator = Math.pow(1 + r, n) - 1;
        
        const emi = numerator / denominator;
        
        // Round to 2 decimal places to avoid floating point issues
        return Math.round(emi * 100) / 100;
    }

    static calculateTotalPayable(emi: number, termMonths: number): number {
        return Math.round((emi * termMonths) * 100) / 100;
    }

    static calculateTotalInterest(totalPayable: number, principal: number): number {
        return Math.round((totalPayable - principal) * 100) / 100;
    }
}
