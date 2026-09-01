import { LoanType } from '../types/BankingTypes';
import { LoanConfig } from '../config/LoanConfig';
import { LoanCalculatorFactory } from '../calculations/LoanCalculatorFactory';
import { AnyLoanInputs } from '../calculations/calculators/ILoanCalculator';

describe('Loan Calculators', () => {
    const baseInputs: AnyLoanInputs = {
        monthlyIncome: 10000,
        existingMonthlyDebt: 1000,
        employmentStabilityScore: 80,
        creditScore: 700,
        repaymentHistoryScore: 90,
        availableAssets: 20000,
        requestedAmount: 5000,
        requestedTermMonths: 12
    };

    describe('PersonalLoanCalculator', () => {
        const config = LoanConfig[LoanType.PERSONAL];
        const calculator = LoanCalculatorFactory.getCalculator(LoanType.PERSONAL);

        it('should approve a standard personal loan', () => {
            const result = calculator.calculate(baseInputs, config);
            if (!result.eligible) console.log('Personal Rejection:', result.reasons);
            expect(result.eligible).toBe(true);
            expect(result.score).toBeGreaterThanOrEqual(50);
            expect(result.maximumLoanAmount).toBeGreaterThan(baseInputs.requestedAmount);
        });

        it('should reject if existing debt is too high', () => {
            const inputs = { ...baseInputs, existingMonthlyDebt: 9500 };
            const result = calculator.calculate(inputs, config);
            expect(result.eligible).toBe(false);
            expect(result.reasons.some(r => r.includes('exceeds maximum affordable loan'))).toBe(true);
        });

        it('should reject if requested amount exceeds bank limit', () => {
            const inputs = { ...baseInputs, requestedAmount: config.borrowingLimit + 1000 };
            const result = calculator.calculate(inputs, config);
            expect(result.eligible).toBe(false);
        });
    });

    describe('EmergencyLoanCalculator', () => {
        const config = LoanConfig[LoanType.EMERGENCY];
        const calculator = LoanCalculatorFactory.getCalculator(LoanType.EMERGENCY);
        
        const emergencyInputs: AnyLoanInputs = {
            ...baseInputs,
            emergencyNecessityScore: 90,
            essentialExpense: 10000,
            requestedAmount: 5000
        };

        it('should approve a valid emergency loan', () => {
            const result = calculator.calculate(emergencyInputs, config);
            expect(result.eligible).toBe(true);
        });

        it('should reject if requested amount is greater than emergency need', () => {
            const inputs = { ...emergencyInputs, requestedAmount: 20000 };
            const result = calculator.calculate(inputs, config);
            expect(result.eligible).toBe(false);
            expect(result.reasons.some(r => r.includes('exceeds emergency requirement'))).toBe(true);
        });
    });

    describe('BusinessLoanCalculator', () => {
        const config = LoanConfig[LoanType.BUSINESS];
        const calculator = LoanCalculatorFactory.getCalculator(LoanType.BUSINESS);
        
        const businessInputs: AnyLoanInputs = {
            ...baseInputs,
            averageMonthlyRevenue: 50000,
            monthlyProfit: 10000,
            monthlyFreeCashFlow: 8000,
            businessStabilityScore: 80,
            businessAssets: 100000,
            businessMultiplier: 3,
            cashFlowHealthScore: 80,
            profitabilityScore: 80,
            assetCoverageScore: 80,
            requestedAmount: 50000,
            requestedTermMonths: 60
        };

        it('should approve a healthy business', () => {
            const result = calculator.calculate(businessInputs, config);
            expect(result.eligible).toBe(true);
            expect(result.maximumLoanAmount).toBeGreaterThanOrEqual(businessInputs.requestedAmount);
        });

        it('should reject if cash flow is insufficient', () => {
            const inputs = { ...businessInputs, monthlyFreeCashFlow: -1000 };
            const result = calculator.calculate(inputs, config);
            expect(result.eligible).toBe(false);
            expect(result.reasons.some(r => r.includes('Insufficient cash flow'))).toBe(true);
        });
    });

    describe('AssetPropertyLoanCalculator', () => {
        const config = LoanConfig[LoanType.ASSET_PROPERTY];
        const calculator = LoanCalculatorFactory.getCalculator(LoanType.ASSET_PROPERTY);
        
        const assetInputs: AnyLoanInputs = {
            ...baseInputs,
            verifiedPropertyValue: 500000,
            downPayment: 100000,
            maxLoanToValueRatio: 0.8,
            assetQualityScore: 90,
            collateralCoverageScore: 90,
            requestedAmount: 200000,
            requestedTermMonths: 120
        };

        it('should approve a well-collateralized asset loan', () => {
            const result = calculator.calculate(assetInputs, config);
            expect(result.eligible).toBe(true);
        });

        it('should reject if requested amount exceeds collateral limit', () => {
            const inputs = { ...assetInputs, requestedAmount: 600000 };
            const result = calculator.calculate(inputs, config);
            expect(result.eligible).toBe(false);
            expect(result.reasons.some(r => r.includes('exceeds collateral limit'))).toBe(true);
        });
    });
});
