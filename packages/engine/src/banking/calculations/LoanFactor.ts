export class LoanFactor {
    /**
     * Calculates the loan factor for a given term and fixed annual interest rate.
     * Derived from the EMI formula: Principal = EMI * LoanFactor
     * => LoanFactor = Principal / EMI
     * @param termMonths Requested term in months
     * @param fixedAnnualInterestRate Annual fixed interest rate (e.g. 0.05 for 5%)
     * @returns The multiplier to determine max loan from max affordable EMI.
     */
    static calculate(termMonths: number, fixedAnnualInterestRate: number): number {
        if (termMonths <= 0 || isNaN(termMonths) || isNaN(fixedAnnualInterestRate)) return 0;
        
        const r = fixedAnnualInterestRate / 12;
        const n = termMonths;

        if (r > 0) {
            const num = Math.pow(1 + r, n) - 1;
            const den = r * Math.pow(1 + r, n);
            // Handle divide by zero just in case
            if (den === 0) return 0;
            return num / den;
        } else {
            return n;
        }
    }
}
