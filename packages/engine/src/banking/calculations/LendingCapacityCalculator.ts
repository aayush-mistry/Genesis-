export class LendingCapacityCalculator {
    /**
     * Calculates the lending capacity for a bank.
     * @param capital The bank's equity/capital
     * @param reserves The bank's current reserves
     * @param totalDeposits Total customer deposits
     * @param totalOutstandingLoans Total principal of active loans
     * @param reserveRatio The required reserve ratio (e.g. 0.1 for 10%)
     */
    static calculateCapacity(
        capital: number,
        reserves: number,
        totalDeposits: number,
        totalOutstandingLoans: number,
        reserveRatio: number
    ): {
        currentLendingCapacity: number;
        availableLendingCapacity: number;
        maximumAdditionalLoanAmount: number;
    } {
        // Banks can generally lend a multiple of their reserves/deposits minus required reserves.
        // A simple model: Maximum Allowed Loans = (totalDeposits + capital) * (1 - reserveRatio)
        
        const baseCapital = totalDeposits + capital;
        const requiredReserves = baseCapital * reserveRatio;
        
        // This is the absolute maximum the bank can lend out in total
        const currentLendingCapacity = Math.max(0, baseCapital - requiredReserves);
        
        // How much more they can lend right now
        const maximumAdditionalLoanAmount = Math.max(0, currentLendingCapacity - totalOutstandingLoans);
        
        return {
            currentLendingCapacity,
            availableLendingCapacity: maximumAdditionalLoanAmount, // synonymous in this simple model
            maximumAdditionalLoanAmount
        };
    }
}
