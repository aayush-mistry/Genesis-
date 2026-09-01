export class CreditScoreCalculator {
    public static readonly MIN_SCORE = 300;
    public static readonly MAX_SCORE = 850;

    /**
     * Updates a credit score based on an event.
     */
    static updateScore(currentScore: number, event: 'LOAN_APPROVED' | 'EMI_PAID' | 'MISSED_EMI' | 'DEFAULT' | 'LOAN_REPAID'): number {
        let delta = 0;
        
        switch (event) {
            case 'LOAN_APPROVED':
                // Slight dip due to new credit inquiry/burden
                delta = -5;
                break;
            case 'EMI_PAID':
                // Small positive reinforcement
                delta = 2;
                break;
            case 'MISSED_EMI':
                // Significant penalty
                delta = -35;
                break;
            case 'DEFAULT':
                // Massive penalty
                delta = -150;
                break;
            case 'LOAN_REPAID':
                // Good boost for completing a loan
                delta = 30;
                break;
        }

        const newScore = Math.min(this.MAX_SCORE, Math.max(this.MIN_SCORE, currentScore + delta));
        return newScore;
    }

    /**
     * Calculates an initial deterministic credit score based on historical data.
     * (If we don't have one yet)
     */
    static calculateInitialScore(
        income: number,
        existingDebt: number,
        ageInSimulationMonths: number
    ): number {
        let score = 500; // Base neutral score
        
        // Income adds stability
        if (income > 100000) score += 50;
        else if (income > 50000) score += 20;

        // Debt hurts
        if (existingDebt > income * 2) score -= 100;
        else if (existingDebt > income) score -= 50;
        else if (existingDebt > 0) score -= 10;
        else score += 30; // No debt is good

        // Age in sim
        score += Math.min(100, ageInSimulationMonths);

        return Math.min(this.MAX_SCORE, Math.max(this.MIN_SCORE, score));
    }
}
