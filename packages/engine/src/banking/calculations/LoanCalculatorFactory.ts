import { LoanType } from '../types/BankingTypes';
import { ILoanCalculator } from './calculators/ILoanCalculator';
import { PersonalLoanCalculator } from './calculators/PersonalLoanCalculator';
import { EmergencyLoanCalculator } from './calculators/EmergencyLoanCalculator';
import { BusinessLoanCalculator } from './calculators/BusinessLoanCalculator';
import { AssetPropertyLoanCalculator } from './calculators/AssetPropertyLoanCalculator';

export class LoanCalculatorFactory {
    static getCalculator(loanType: LoanType): ILoanCalculator {
        switch (loanType) {
            case LoanType.PERSONAL:
                return new PersonalLoanCalculator();
            case LoanType.EMERGENCY:
                return new EmergencyLoanCalculator();
            case LoanType.BUSINESS:
                return new BusinessLoanCalculator();
            case LoanType.ASSET_PROPERTY:
                return new AssetPropertyLoanCalculator();
            default:
                throw new Error(`No calculator found for LoanType: ${loanType}`);
        }
    }
}
