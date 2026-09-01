export enum LoanType {
    PERSONAL = 'PERSONAL',
    EMERGENCY = 'EMERGENCY',
    BUSINESS = 'BUSINESS',
    ASSET_PROPERTY = 'ASSET_PROPERTY'
}

export enum LoanStatus {
    PENDING = 'PENDING',
    APPROVED = 'APPROVED',
    REJECTED = 'REJECTED',
    ACTIVE = 'ACTIVE',
    PAST_DUE = 'PAST_DUE',
    DEFAULTED = 'DEFAULTED',
    PAID_OFF = 'PAID_OFF',
    CANCELLED = 'CANCELLED'
}

export enum BankAccountType {
    CHECKING = 'CHECKING',
    SAVINGS = 'SAVINGS'
}

export enum BankStatus {
    ACTIVE = 'ACTIVE',
    INACTIVE = 'INACTIVE'
}

export interface EligibilityResult {
    eligible: boolean;
    score: number;
    maximumEligibleAmount: number;
    reasons: string[];
}

export interface IBankingRepository {
    createBank(data: any): Promise<any>;
    getBank(id: string): Promise<any>;
    listBanks(): Promise<any[]>;
    updateBankStats(id: string, updates: any): Promise<any>;
    
    createAccount(data: any): Promise<any>;
    getAccountByOwner(ownerId: string): Promise<any>;
    getAccountById(accountId: string): Promise<any>;
    
    createLoanApplication(data: any): Promise<any>;
    getLoanApplication(id: string): Promise<any>;
    updateLoanApplication(id: string, data: any): Promise<any>;
    
    createLoan(data: any): Promise<any>;
    getLoan(id: string): Promise<any>;
    listActiveLoans(): Promise<any[]>;
    updateLoan(id: string, data: any): Promise<any>;
    
    createLoanPayment(data: any): Promise<any>;
    
    getCreditHistory(ownerId: string): Promise<any>;
    createOrUpdateCreditHistory(ownerId: string, score: number, eventStr: string): Promise<any>;

    executeTransaction<T>(fn: (tx: any) => Promise<T>): Promise<T>;
}
