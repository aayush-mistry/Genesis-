import { EventScheduler } from '../events/EventScheduler';
import { SimulationEvent } from '../events/SimulationEvent';
import { EventRegistry } from '../events/EventRegistry';
import { TimeEngine } from '../time/TimeEngine';
import { MarketEngine } from '../market/MarketEngine';
import { WorldEngine } from '../world/WorldEngine';
import { TransactionType, Wallet } from '@genesis/shared';
import { LoanType, LoanStatus, BankAccountType, BankStatus, IBankingRepository } from './types/BankingTypes';
import { LoanCalculatorFactory } from './calculations/LoanCalculatorFactory';
import { AnyLoanInputs } from './calculations/calculators/ILoanCalculator';
import { EMICalculator } from './calculations/EMICalculator';
import { LendingCapacityCalculator } from './calculations/LendingCapacityCalculator';
import { CreditScoreCalculator } from './calculations/CreditScoreCalculator';
import { LoanConfig } from './config/LoanConfig';

export class BankingEngine {
    private scheduler: EventScheduler;
    private timeEngine: TimeEngine;
    private repo: IBankingRepository;
    private marketEngine: MarketEngine;

    constructor(
        scheduler: EventScheduler,
        timeEngine: TimeEngine,
        repo: IBankingRepository,
        marketEngine?: MarketEngine
    ) {
        this.scheduler = scheduler;
        this.timeEngine = timeEngine;
        this.repo = repo;
        this.marketEngine = marketEngine || new MarketEngine(new WorldEngine(), timeEngine, scheduler);
        
        EventRegistry.register('BankingEngine.processMonthlyEMIs', async () => {
            await this.processMonthlyEMIs();
        });
    }

    public setMarketEngine(marketEngine: MarketEngine): void {
        this.marketEngine = marketEngine;
    }

    public getMarketEngine(): MarketEngine {
        return this.marketEngine;
    }

    public async initialize() {
        const upcoming = this.scheduler.getUpcomingEvents();
        const existing = upcoming.find(e => e.id.startsWith('monthly-emi-processing'));
        if (!existing) {
            this.scheduleMonthlyEMI();
        }
        await this.syncAllBankWallets();
    }

    public async syncAllBankWallets() {
        try {
            const banks = await this.repo.listBanks();
            for (const bank of banks) {
                await this.ensureBankWallet(bank);
            }
        } catch (e) {
            console.error('[BankingEngine] Error syncing bank wallets:', e);
        }
    }

    private scheduleMonthlyEMI() {
        // Schedule an event at the start of next month
        const now = this.timeEngine.getCurrentTime();
        let nextMonth = { ...now };
        nextMonth.month += 1;
        if (nextMonth.month > 12) {
            nextMonth.month = 1;
            nextMonth.year += 1;
        }
        nextMonth.day = 1;
        nextMonth.hour = 0;
        nextMonth.minute = 0;
        nextMonth.second = 0;

        const emiEvent: SimulationEvent = {
            id: 'monthly-emi-processing',
            name: 'Monthly EMI Processing',
            description: 'Processes monthly EMI for all active loans',
            priority: 'High',
            status: 'Scheduled',
            createdTime: now,
            scheduledTime: nextMonth,
            handlerName: 'BankingEngine.processMonthlyEMIs',
            sourceModule: 'BankingEngine',
            targetModule: 'BankingEngine',
            recurrence: {
                interval: 'Month'
            },
            cancelFlag: false,
            retryCount: 0
        };

        this.scheduler.scheduleEvent(emiEvent);
    }

    // ==========================================
    // Authoritative Wallet Resolution
    // ==========================================

    public async ensureBankWallet(bank: any, tx?: any): Promise<Wallet> {
        let wallet = this.marketEngine.getWallet(bank.id);
        if (wallet) {
            return wallet;
        }

        const client = tx || (this.repo as any).getPrisma?.() || (this.repo as any).prisma;
        let dbWallet: any = null;
        if (client?.wallet) {
            dbWallet = await client.wallet.findUnique({ where: { ownerId: bank.id } });
            if (!dbWallet) {
                try {
                    dbWallet = await client.wallet.create({
                        data: {
                            id: `wallet-bank-${bank.id}`,
                            ownerId: bank.id,
                            balance: bank.reserves ?? bank.capital ?? 0,
                            currency: 'CREDIT',
                            totalIncome: 0,
                            totalExpenses: 0
                        }
                    });
                } catch (e) {
                    dbWallet = await client.wallet.findUnique({ where: { ownerId: bank.id } });
                }
            }
        }

        wallet = {
            id: dbWallet?.id || `wallet-bank-${bank.id}`,
            ownerId: bank.id,
            balance: dbWallet ? dbWallet.balance : (bank.reserves ?? bank.capital ?? 0),
            currency: dbWallet?.currency || 'CREDIT',
            totalIncome: dbWallet?.totalIncome || 0,
            totalExpenses: dbWallet?.totalExpenses || 0
        };

        this.marketEngine.registerWallet(wallet);
        return wallet;
    }

    public async getAuthoritativeWallet(ownerId: string, walletId?: string, tx?: any): Promise<Wallet> {
        // 1. Check MarketEngine first (covers citizenService, worldEngine workplaces, and registered wallets)
        let wallet = this.marketEngine.getWallet(ownerId);
        if (wallet) {
            return wallet;
        }

        // 2. Fall back to DB lookup if not yet loaded in memory
        const client = tx || (this.repo as any).getPrisma?.() || (this.repo as any).prisma;
        let dbWallet: any = null;
        if (client?.wallet) {
            if (walletId) {
                dbWallet = await client.wallet.findUnique({ where: { id: walletId } });
            }
            if (!dbWallet) {
                dbWallet = await client.wallet.findUnique({ where: { ownerId } });
            }
        } else if (this.repo.getWalletById && walletId) {
            dbWallet = await this.repo.getWalletById(walletId);
        } else if (this.repo.getWalletByOwner) {
            dbWallet = await this.repo.getWalletByOwner(ownerId);
        }

        if (dbWallet) {
            wallet = {
                id: dbWallet.id,
                ownerId: dbWallet.ownerId,
                balance: dbWallet.balance,
                currency: dbWallet.currency,
                totalIncome: dbWallet.totalIncome,
                totalExpenses: dbWallet.totalExpenses
            };
            this.marketEngine.registerWallet(wallet);
            return wallet;
        }

        throw new Error(`Authoritative wallet not found for owner ${ownerId}`);
    }

    // ==========================================
    // Bank Operations
    // ==========================================
    
    async createBank(name: string, capital: number) {
        const bank = await this.repo.createBank({
            name,
            capital,
            reserves: capital,
            totalDeposits: 0
        });

        await this.ensureBankWallet(bank);
        return bank;
    }

    // ==========================================
    // Account Operations
    // ==========================================

    async deposit(accountId: string, amount: number) {
        if (amount <= 0) throw new Error("Amount must be positive");
        
        const account = await this.repo.getAccountById(accountId);
        if (!account) throw new Error("Account not found");

        const borrowerWallet = await this.getAuthoritativeWallet(account.ownerId, account.walletId);
        const bank = await this.repo.getBank(account.bankId);
        if (!bank) throw new Error("Bank not found");
        const bankWallet = await this.ensureBankWallet(bank);

        borrowerWallet.balance += amount;
        borrowerWallet.totalIncome += amount;
        bankWallet.balance += amount;

        return await this.repo.executeTransaction(async (tx) => {
            // Update wallet balance in DB
            await tx.wallet.update({
                where: { id: account.walletId },
                data: { balance: borrowerWallet.balance, totalIncome: borrowerWallet.totalIncome }
            });

            // Update bank wallet in DB if exists
            const dbBankWallet = await tx.wallet.findUnique({ where: { ownerId: account.bankId } });
            if (dbBankWallet) {
                await tx.wallet.update({
                    where: { id: dbBankWallet.id },
                    data: { balance: bankWallet.balance }
                });
            }

            // Update bank reserves/deposits
            await tx.bank.update({
                where: { id: account.bankId },
                data: {
                    totalDeposits: { increment: amount },
                    reserves: bankWallet.balance
                }
            });

            return true;
        });
    }

    async withdraw(accountId: string, amount: number) {
        if (amount <= 0) throw new Error("Amount must be positive");

        const account = await this.repo.getAccountById(accountId);
        if (!account) throw new Error("Account not found");

        const borrowerWallet = await this.getAuthoritativeWallet(account.ownerId, account.walletId);
        if (borrowerWallet.balance < amount) throw new Error("Insufficient funds");

        const bank = await this.repo.getBank(account.bankId);
        if (!bank) throw new Error("Bank not found");
        const bankWallet = await this.ensureBankWallet(bank);
        if (bankWallet.balance < amount) throw new Error("Bank has insufficient reserves");

        borrowerWallet.balance -= amount;
        borrowerWallet.totalExpenses += amount;
        bankWallet.balance -= amount;

        return await this.repo.executeTransaction(async (tx) => {
            // Deduct wallet balance in DB
            await tx.wallet.update({
                where: { id: account.walletId },
                data: { balance: borrowerWallet.balance, totalExpenses: borrowerWallet.totalExpenses }
            });

            // Update bank wallet in DB if exists
            const dbBankWallet = await tx.wallet.findUnique({ where: { ownerId: account.bankId } });
            if (dbBankWallet) {
                await tx.wallet.update({
                    where: { id: dbBankWallet.id },
                    data: { balance: bankWallet.balance }
                });
            }

            // Deduct bank reserves/deposits
            await tx.bank.update({
                where: { id: account.bankId },
                data: {
                    totalDeposits: { decrement: amount },
                    reserves: bankWallet.balance
                }
            });

            return true;
        });
    }

    async transfer(fromAccountId: string, toAccountId: string, amount: number) {
        if (amount <= 0) throw new Error("Amount must be positive");

        const fromAccount = await this.repo.getAccountById(fromAccountId);
        const toAccount = await this.repo.getAccountById(toAccountId);
        if (!fromAccount || !toAccount) throw new Error("Account not found");

        const fromWallet = await this.getAuthoritativeWallet(fromAccount.ownerId, fromAccount.walletId);
        const toWallet = await this.getAuthoritativeWallet(toAccount.ownerId, toAccount.walletId);

        if (fromWallet.balance < amount) throw new Error("Insufficient funds");

        const transferTxId = `BANK-TRANSFER-${fromAccountId}-${toAccountId}-${Date.now()}`;
        const txRecord = this.marketEngine.processTransaction(
            fromAccount.ownerId,
            toAccount.ownerId,
            null,
            null,
            null,
            null,
            amount,
            fromWallet.currency,
            TransactionType.TRANSFER,
            'DEFAULT',
            transferTxId
        );

        if (!txRecord) {
            throw new Error("Transfer failed in MarketEngine");
        }

        return await this.repo.executeTransaction(async (tx) => {
            await tx.wallet.update({
                where: { id: fromAccount.walletId },
                data: { balance: fromWallet.balance, totalExpenses: fromWallet.totalExpenses }
            });
            await tx.wallet.update({
                where: { id: toAccount.walletId },
                data: { balance: toWallet.balance, totalIncome: toWallet.totalIncome }
            });
            return true;
        });
    }

    // ==========================================
    // Loan Lifecycle Operations
    // ==========================================

    async applyForLoan(
        bankId: string,
        borrowerId: string, // Poly ownerId
        loanType: LoanType,
        requestedAmount: number,
        requestedTermMonths: number,
        financials: Omit<AnyLoanInputs, 'requestedAmount' | 'requestedTermMonths'> & { requestedAmount?: number, requestedTermMonths?: number }
    ) {
        financials.requestedAmount = requestedAmount;
        financials.requestedTermMonths = requestedTermMonths;
        
        const calculator = LoanCalculatorFactory.getCalculator(loanType);
        const config = LoanConfig[loanType as LoanType];
        const eligibility = calculator.calculate(financials as AnyLoanInputs, config);

        const application = await this.repo.createLoanApplication({
            bankId,
            borrowerId,
            loanType,
            requestedAmount,
            requestedTermMonths,
            status: eligibility.eligible ? 'APPROVED' : 'REJECTED',
            eligibilityScore: eligibility.score,
            eligibilityReasonsJson: JSON.stringify(eligibility.reasons)
        });

        if (eligibility.eligible) {
            await this.approveAndIssueLoan(application.id);
            // Fetch the potentially updated application (e.g. rejected due to capacity)
            const updated = await this.repo.getLoanApplication(application.id);
            return updated || application;
        }

        return application;
    }

    private async approveAndIssueLoan(applicationId: string) {
        // Find application
        const application = await this.repo.getLoanApplication(applicationId);
        if (!application || application.status !== 'APPROVED') return;

        // Idempotency check:
        const disburseTxId = `LOAN-DISBURSE-${application.id}`;
        if (this.marketEngine.hasTransaction(disburseTxId)) {
            console.log(`[BankingEngine] Loan disbursement ${disburseTxId} already processed (idempotency caught).`);
            return;
        }

        const activeLoans = await this.repo.listActiveLoans();
        const alreadyDisbursed = activeLoans.find(
            (l: any) => l.bankId === application.bankId &&
                        l.borrowerId === application.borrowerId &&
                        l.collateralJson &&
                        l.collateralJson.includes(disburseTxId)
        );
        if (alreadyDisbursed) {
            console.log(`[BankingEngine] Loan for application ${application.id} already issued (idempotency caught).`);
            return;
        }

        // Check lending capacity
        const bank = await this.repo.getBank(application.bankId);
        if (!bank) throw new Error("Bank not found");

        const capacity = LendingCapacityCalculator.calculateCapacity(
            bank.capital,
            bank.reserves,
            bank.totalDeposits,
            bank.totalLoans,
            bank.reserveRatio
        );

        if (application.requestedAmount > capacity.maximumAdditionalLoanAmount) {
            // Reject dynamically if bank can't afford it
            await this.repo.updateLoanApplication(applicationId, {
                status: 'REJECTED',
                eligibilityReasonsJson: JSON.stringify(["Bank has insufficient lending capacity."])
            });
            return;
        }

        // We need an account for the borrower in this bank to deposit the money
        let account = await this.repo.getAccountByOwner(application.borrowerId);
        if (!account) {
            throw new Error("Borrower has no account to receive funds.");
        }

        // Resolve authoritative wallets BEFORE mutating
        const borrowerWallet = await this.getAuthoritativeWallet(application.borrowerId, account.walletId);
        const bankWallet = await this.ensureBankWallet(bank);

        // Check bank liquid reserves
        if (bankWallet.balance < application.requestedAmount) {
            await this.repo.updateLoanApplication(applicationId, {
                status: 'REJECTED',
                eligibilityReasonsJson: JSON.stringify(["Bank has insufficient liquid reserves."])
            });
            return;
        }

        const config = LoanConfig[application.loanType as LoanType];
        const monthlyEmi = EMICalculator.calculateMonthlyEMI(
            application.requestedAmount,
            config.fixedInterestRate,
            application.requestedTermMonths
        );

        // Snapshot in-memory balances for rollback if DB transaction fails
        const borrowerBalBefore = borrowerWallet.balance;
        const borrowerIncomeBefore = borrowerWallet.totalIncome;
        const bankBalBefore = bankWallet.balance;
        const bankExpenseBefore = bankWallet.totalExpenses;

        // Process financial transfer in MarketEngine
        const txRecord = this.marketEngine.processTransaction(
            bank.id,
            application.borrowerId,
            null,
            null,
            null,
            null,
            application.requestedAmount,
            borrowerWallet.currency,
            TransactionType.TRANSFER,
            'DEFAULT',
            disburseTxId
        );

        if (!txRecord) {
            throw new Error(`Failed to disburse loan: MarketEngine rejected transfer.`);
        }

        try {
            await this.repo.executeTransaction(async (tx) => {
                // Secondary DB idempotency check
                const existingLoan = await tx.loan.findFirst({
                    where: {
                        bankId: bank.id,
                        borrowerId: application.borrowerId,
                        accountId: account.id,
                        collateralJson: { contains: disburseTxId }
                    }
                });
                if (existingLoan) {
                    return;
                }

                // 1. Create the loan asset
                await tx.loan.create({
                    data: {
                        bankId: bank.id,
                        borrowerId: application.borrowerId,
                        accountId: account.id,
                        loanType: application.loanType,
                        status: 'ACTIVE',
                        principal: application.requestedAmount,
                        interestRate: config.fixedInterestRate,
                        termMonths: application.requestedTermMonths,
                        monthlyEmi: monthlyEmi,
                        remainingPrincipal: application.requestedAmount,
                        collateralJson: JSON.stringify({ disburseTxId })
                    }
                });

                // 2. Persist borrower wallet to match authoritative balance
                await tx.wallet.update({
                    where: { id: account.walletId },
                    data: {
                        balance: borrowerWallet.balance,
                        totalIncome: borrowerWallet.totalIncome
                    }
                });

                // 3. Persist bank wallet if it exists in DB
                const dbBankWallet = await tx.wallet.findUnique({ where: { ownerId: bank.id } });
                if (dbBankWallet) {
                    await tx.wallet.update({
                        where: { id: dbBankWallet.id },
                        data: {
                            balance: bankWallet.balance,
                            totalExpenses: bankWallet.totalExpenses
                        }
                    });
                }

                // 4. Update bank totals
                await tx.bank.update({
                    where: { id: bank.id },
                    data: {
                        totalLoans: { increment: application.requestedAmount },
                        reserves: bankWallet.balance,
                        totalDeposits: { increment: application.requestedAmount }
                    }
                });

                // 5. Update credit history
                const existingCH = await tx.creditHistory.findUnique({ where: { ownerId: application.borrowerId }});
                const newScore = CreditScoreCalculator.updateScore(existingCH?.creditScore || 500, 'LOAN_APPROVED');
                if (existingCH) {
                    await tx.creditHistory.update({
                        where: { ownerId: application.borrowerId },
                        data: { creditScore: newScore }
                    });
                } else {
                    await tx.creditHistory.create({
                        data: { ownerId: application.borrowerId, creditScore: newScore, historyEventsJson: "[]" }
                    });
                }
            });
        } catch (dbError) {
            borrowerWallet.balance = borrowerBalBefore;
            borrowerWallet.totalIncome = borrowerIncomeBefore;
            bankWallet.balance = bankBalBefore;
            bankWallet.totalExpenses = bankExpenseBefore;
            (this.marketEngine as any).transactions?.delete(disburseTxId);
            throw dbError;
        }
    }

    public async processMonthlyEMIs() {
        const activeLoans = await this.repo.listActiveLoans();
        const simTime = this.timeEngine.getCurrentTime();
        const timestamp = simTime.year * 10000 + simTime.month * 100 + simTime.day; 

        for (const loan of activeLoans) {
            try {
                await this.processEMIForLoan(loan, timestamp);
            } catch (e) {
                console.error(`Failed to process EMI for loan ${loan.id}`, e);
            }
        }
    }

    private async processEMIForLoan(loan: any, timestamp: number) {
        const emiTxId = `LOAN-EMI-${loan.id}-${timestamp}`;

        // Ensure exactly-once execution per EMI period
        if (this.marketEngine.hasTransaction(emiTxId)) {
            console.log(`[BankingEngine] EMI payment ${emiTxId} already processed (idempotency caught).`);
            return;
        }

        // Interest portion: (Remaining Principal * annualRate) / 12
        const interestPortion = Math.round((loan.remainingPrincipal * loan.interestRate / 12) * 100) / 100;
        const principalPortion = loan.monthlyEmi - interestPortion;

        const account = await this.repo.getAccountById(loan.accountId) || await this.repo.getAccountByOwner(loan.borrowerId);
        if (!account) return;

        const borrowerWallet = await this.getAuthoritativeWallet(loan.borrowerId, account.walletId);
        const bank = await this.repo.getBank(loan.bankId);
        if (!bank) return;
        const bankWallet = await this.ensureBankWallet(bank);

        if (borrowerWallet.balance < loan.monthlyEmi) {
            // MISSED PAYMENT - No wallet deduction, no partial changes!
            await this.repo.executeTransaction(async (tx) => {
                const missed = loan.missedPayments + 1;
                let newStatus = missed >= 3 ? 'DEFAULTED' : 'PAST_DUE';

                await tx.loan.update({
                    where: { id: loan.id },
                    data: {
                        missedPayments: missed,
                        status: newStatus
                    }
                });

                const ch = await tx.creditHistory.findUnique({ where: { ownerId: loan.borrowerId }});
                if (ch) {
                    const score = CreditScoreCalculator.updateScore(
                        ch.creditScore, 
                        newStatus === 'DEFAULTED' ? 'DEFAULT' : 'MISSED_EMI'
                    );
                    await tx.creditHistory.update({
                        where: { ownerId: loan.borrowerId },
                        data: { creditScore: score }
                    });
                }
            });
            return;
        }

        // SUCCESSFUL PAYMENT
        const borrowerBalBefore = borrowerWallet.balance;
        const borrowerExpenseBefore = borrowerWallet.totalExpenses;
        const bankBalBefore = bankWallet.balance;
        const bankIncomeBefore = bankWallet.totalIncome;

        const txRecord = this.marketEngine.processTransaction(
            loan.borrowerId,
            loan.bankId,
            null,
            null,
            null,
            null,
            loan.monthlyEmi,
            borrowerWallet.currency,
            TransactionType.TRANSFER,
            'DEFAULT',
            emiTxId
        );

        if (!txRecord) {
            console.error(`[BankingEngine] MarketEngine failed to process EMI payment ${emiTxId}`);
            return;
        }

        try {
            await this.repo.executeTransaction(async (tx) => {
                const existingPayment = await tx.loanPayment.findFirst({
                    where: { loanId: loan.id, timestamp: timestamp }
                });
                if (existingPayment) {
                    return; // Already processed!
                }

                // 1. Persist borrower wallet to match authoritative balance
                await tx.wallet.update({
                    where: { id: account.walletId },
                    data: {
                        balance: borrowerWallet.balance,
                        totalExpenses: borrowerWallet.totalExpenses
                    }
                });

                // 2. Persist bank wallet if exists in DB
                const dbBankWallet = await tx.wallet.findUnique({ where: { ownerId: loan.bankId } });
                if (dbBankWallet) {
                    await tx.wallet.update({
                        where: { id: dbBankWallet.id },
                        data: {
                            balance: bankWallet.balance,
                            totalIncome: bankWallet.totalIncome
                        }
                    });
                }

                // 3. Reduce loan principal
                const newPrincipal = Math.max(0, loan.remainingPrincipal - principalPortion);
                const isPaidOff = newPrincipal <= 0;

                await tx.loan.update({
                    where: { id: loan.id },
                    data: {
                        remainingPrincipal: newPrincipal,
                        missedPayments: 0,
                        status: isPaidOff ? 'PAID_OFF' : 'ACTIVE'
                    }
                });

                // 4. Record payment
                await tx.loanPayment.create({
                    data: {
                        loanId: loan.id,
                        amount: loan.monthlyEmi,
                        principalPortion: principalPortion,
                        interestPortion: interestPortion,
                        timestamp: timestamp
                    }
                });

                // 5. Update bank outstanding
                await tx.bank.update({
                    where: { id: loan.bankId },
                    data: {
                        totalLoans: { decrement: principalPortion },
                        reserves: bankWallet.balance
                    }
                });

                // 6. Update Credit Score
                const ch = await tx.creditHistory.findUnique({ where: { ownerId: loan.borrowerId }});
                if (ch) {
                    let score = CreditScoreCalculator.updateScore(ch.creditScore, 'EMI_PAID');
                    if (isPaidOff) score = CreditScoreCalculator.updateScore(score, 'LOAN_REPAID');
                    await tx.creditHistory.update({
                        where: { ownerId: loan.borrowerId },
                        data: { creditScore: score }
                    });
                }
            });
        } catch (dbError) {
            borrowerWallet.balance = borrowerBalBefore;
            borrowerWallet.totalExpenses = borrowerExpenseBefore;
            bankWallet.balance = bankBalBefore;
            bankWallet.totalIncome = bankIncomeBefore;
            (this.marketEngine as any).transactions?.delete(emiTxId);
            throw dbError;
        }
    }
}
