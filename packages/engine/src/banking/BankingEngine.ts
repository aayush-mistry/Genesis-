import { EventScheduler } from '../events/EventScheduler';
import { SimulationEvent } from '../events/SimulationEvent';
import { TimeEngine } from '../time/TimeEngine';
import { LoanType, LoanStatus, BankAccountType, BankStatus, IBankingRepository } from './types/BankingTypes';
import { LoanEligibilityCalculator } from './calculations/LoanEligibilityCalculator';
import { EMICalculator } from './calculations/EMICalculator';
import { LendingCapacityCalculator } from './calculations/LendingCapacityCalculator';
import { CreditScoreCalculator } from './calculations/CreditScoreCalculator';
import { LoanConfig } from './config/LoanConfig';

export class BankingEngine {
    private scheduler: EventScheduler;
    private timeEngine: TimeEngine;
    private repo: IBankingRepository;

    constructor(scheduler: EventScheduler, timeEngine: TimeEngine, repo: IBankingRepository) {
        this.scheduler = scheduler;
        this.timeEngine = timeEngine;
        this.repo = repo;
    }

    public initialize() {
        this.scheduleMonthlyEMI();
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
            handler: async () => {
                await this.processMonthlyEMIs();
            },
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
    // Bank Operations
    // ==========================================
    
    async createBank(name: string, capital: number) {
        return this.repo.createBank({
            name,
            capital,
            reserves: capital,
            totalDeposits: 0
        });
    }

    // ==========================================
    // Account Operations
    // ==========================================

    async deposit(accountId: string, amount: number) {
        if (amount <= 0) throw new Error("Amount must be positive");
        
        return await this.repo.executeTransaction(async (tx) => {
            const account = await tx.bankAccount.findUnique({ where: { accountId } });
            if (!account) throw new Error("Account not found");

            // Update wallet balance
            await tx.wallet.update({
                where: { id: account.walletId },
                data: { balance: { increment: amount } }
            });

            // Update bank reserves/deposits
            await tx.bank.update({
                where: { id: account.bankId },
                data: {
                    totalDeposits: { increment: amount },
                    reserves: { increment: amount }
                }
            });

            return true;
        });
    }

    async withdraw(accountId: string, amount: number) {
        if (amount <= 0) throw new Error("Amount must be positive");

        return await this.repo.executeTransaction(async (tx) => {
            const account = await tx.bankAccount.findUnique({ where: { accountId } });
            if (!account) throw new Error("Account not found");

            const wallet = await tx.wallet.findUnique({ where: { id: account.walletId } });
            if (!wallet || wallet.balance < amount) throw new Error("Insufficient funds");

            const bank = await tx.bank.findUnique({ where: { id: account.bankId } });
            if (!bank || bank.reserves < amount) throw new Error("Bank has insufficient reserves");

            // Deduct wallet balance
            await tx.wallet.update({
                where: { id: account.walletId },
                data: { balance: { decrement: amount } }
            });

            // Deduct bank reserves/deposits
            await tx.bank.update({
                where: { id: account.bankId },
                data: {
                    totalDeposits: { decrement: amount },
                    reserves: { decrement: amount }
                }
            });

            return true;
        });
    }

    async transfer(fromAccountId: string, toAccountId: string, amount: number) {
        if (amount <= 0) throw new Error("Amount must be positive");

        return await this.repo.executeTransaction(async (tx) => {
            const fromAccount = await tx.bankAccount.findUnique({ where: { accountId: fromAccountId } });
            const toAccount = await tx.bankAccount.findUnique({ where: { accountId: toAccountId } });

            if (!fromAccount || !toAccount) throw new Error("Account not found");

            const fromWallet = await tx.wallet.findUnique({ where: { id: fromAccount.walletId } });
            if (!fromWallet || fromWallet.balance < amount) throw new Error("Insufficient funds");

            const fromBank = await tx.bank.findUnique({ where: { id: fromAccount.bankId } });
            if (!fromBank || fromBank.reserves < amount) throw new Error("Bank has insufficient reserves");

            // Deduct from sender
            await tx.wallet.update({
                where: { id: fromAccount.walletId },
                data: { balance: { decrement: amount } }
            });
            await tx.bank.update({
                where: { id: fromAccount.bankId },
                data: { totalDeposits: { decrement: amount }, reserves: { decrement: amount } }
            });

            // Add to receiver
            await tx.wallet.update({
                where: { id: toAccount.walletId },
                data: { balance: { increment: amount } }
            });
            await tx.bank.update({
                where: { id: toAccount.bankId },
                data: { totalDeposits: { increment: amount }, reserves: { increment: amount } }
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
        financials: any
    ) {
        const eligibility = LoanEligibilityCalculator.evaluateEligibility(
            loanType,
            requestedAmount,
            requestedTermMonths,
            financials
        );

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
            // Create a mock wallet and account if not exists for this phase
            // Ideally, we fetch existing wallet. But let's assume we link or create.
            // In a real system, the owner would create an account beforehand.
            throw new Error("Borrower has no account to receive funds.");
        }

        const config = LoanConfig[application.loanType as LoanType];
        const monthlyEmi = EMICalculator.calculateMonthlyEMI(
            application.requestedAmount,
            config.fixedInterestRate,
            application.requestedTermMonths
        );

        // Transaction block for Money Creation!
        await this.repo.executeTransaction(async (tx) => {
            // 1. Create the loan asset
            const loan = await tx.loan.create({
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
                }
            });

            // 2. Deposit money into borrower's wallet/account
            await tx.wallet.update({
                where: { id: account.walletId },
                data: { balance: { increment: application.requestedAmount } }
            });

            // 3. Update bank totals
            await tx.bank.update({
                where: { id: bank.id },
                data: {
                    totalLoans: { increment: application.requestedAmount },
                    totalDeposits: { increment: application.requestedAmount } // Assuming deposit is in the same bank
                }
            });

            // 4. Update credit history
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
    }

    public async processMonthlyEMIs() {
        const activeLoans = await this.repo.listActiveLoans();
        const simTime = this.timeEngine.getCurrentTime();
        // naive timestamp
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
        // Interest portion: (Remaining Principal * annualRate) / 12
        const interestPortion = Math.round((loan.remainingPrincipal * loan.interestRate / 12) * 100) / 100;
        const principalPortion = loan.monthlyEmi - interestPortion;

        await this.repo.executeTransaction(async (tx) => {
            const account = await tx.bankAccount.findUnique({ where: { id: loan.accountId } });
            if (!account) return;

            const wallet = await tx.wallet.findUnique({ where: { id: account.walletId } });
            if (!wallet) return;

            if (wallet.balance >= loan.monthlyEmi) {
                // SUCCESSFUL PAYMENT
                
                // 1. Deduct from wallet
                await tx.wallet.update({
                    where: { id: wallet.id },
                    data: { balance: { decrement: loan.monthlyEmi } }
                });

                // 2. Reduce loan principal
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

                // 3. Record payment
                await tx.loanPayment.create({
                    data: {
                        loanId: loan.id,
                        amount: loan.monthlyEmi,
                        principalPortion: principalPortion,
                        interestPortion: interestPortion,
                        timestamp: timestamp
                    }
                });

                // 4. Update bank outstanding
                await tx.bank.update({
                    where: { id: loan.bankId },
                    data: {
                        totalLoans: { decrement: principalPortion }
                    }
                });

                // 5. Update Credit Score
                const ch = await tx.creditHistory.findUnique({ where: { ownerId: loan.borrowerId }});
                if (ch) {
                    let score = CreditScoreCalculator.updateScore(ch.creditScore, 'EMI_PAID');
                    if (isPaidOff) score = CreditScoreCalculator.updateScore(score, 'LOAN_REPAID');
                    await tx.creditHistory.update({
                        where: { ownerId: loan.borrowerId },
                        data: { creditScore: score }
                    });
                }

            } else {
                // MISSED PAYMENT
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
            }
        });
    }
}
