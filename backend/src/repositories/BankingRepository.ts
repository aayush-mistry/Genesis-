import { PrismaClient, Bank, BankAccount, Loan, LoanApplication, LoanPayment, CreditHistory } from '@prisma/client';

const prisma = new PrismaClient();

export class BankingRepository {
    // ==========================================
    // Bank
    // ==========================================
    async createBank(data: { name: string; capital: number; reserves: number; totalDeposits: number }): Promise<Bank> {
        return prisma.bank.create({
            data: {
                ...data,
                lendingCapacity: 0,
            }
        });
    }

    async getBank(id: string): Promise<Bank | null> {
        return prisma.bank.findUnique({ where: { id } });
    }

    async listBanks(): Promise<Bank[]> {
        return prisma.bank.findMany();
    }

    async updateBankStats(id: string, updates: Partial<Bank>): Promise<Bank> {
        return prisma.bank.update({
            where: { id },
            data: updates
        });
    }

    // ==========================================
    // Account
    // ==========================================
    async createAccount(data: { accountId: string; bankId: string; ownerId: string; walletId: string; accountType: string }): Promise<BankAccount> {
        return prisma.bankAccount.create({ data });
    }

    async getAccountByOwner(ownerId: string): Promise<BankAccount | null> {
        return prisma.bankAccount.findFirst({ where: { ownerId } });
    }

    async getAccountById(accountId: string): Promise<BankAccount | null> {
        return prisma.bankAccount.findUnique({ where: { accountId } });
    }

    // ==========================================
    // Loan
    // ==========================================
    async createLoanApplication(data: any): Promise<LoanApplication> {
        return prisma.loanApplication.create({ data });
    }

    async getLoanApplication(id: string): Promise<LoanApplication | null> {
        return prisma.loanApplication.findUnique({ where: { id } });
    }

    async updateLoanApplication(id: string, data: any): Promise<LoanApplication> {
        return prisma.loanApplication.update({ where: { id }, data });
    }

    async createLoan(data: any): Promise<Loan> {
        return prisma.loan.create({ data });
    }

    async getLoan(id: string): Promise<Loan | null> {
        return prisma.loan.findUnique({ where: { id } });
    }

    async listActiveLoans(): Promise<Loan[]> {
        return prisma.loan.findMany({
            where: {
                status: { in: ['ACTIVE', 'PAST_DUE'] }
            }
        });
    }

    async updateLoan(id: string, data: any): Promise<Loan> {
        return prisma.loan.update({ where: { id }, data });
    }

    async createLoanPayment(data: any): Promise<LoanPayment> {
        return prisma.loanPayment.create({ data });
    }

    // ==========================================
    // Credit History
    // ==========================================
    async getCreditHistory(ownerId: string): Promise<CreditHistory | null> {
        return prisma.creditHistory.findUnique({ where: { ownerId } });
    }

    async createOrUpdateCreditHistory(ownerId: string, score: number, eventStr: string): Promise<CreditHistory> {
        const existing = await this.getCreditHistory(ownerId);
        
        if (existing) {
            let events = [];
            try {
                events = JSON.parse(existing.historyEventsJson);
            } catch(e) {}
            events.push({ event: eventStr, timestamp: Date.now() });
            
            return prisma.creditHistory.update({
                where: { ownerId },
                data: {
                    creditScore: score,
                    historyEventsJson: JSON.stringify(events)
                }
            });
        } else {
            return prisma.creditHistory.create({
                data: {
                    ownerId,
                    creditScore: score,
                    historyEventsJson: JSON.stringify([{ event: eventStr, timestamp: Date.now() }])
                }
            });
        }
    }
    async executeTransaction<T>(fn: (tx: any) => Promise<T>): Promise<T> {
        return prisma.$transaction(fn);
    }

    // Support for Prisma Transactions
    getPrisma() {
        return prisma;
    }
}

export const bankingRepository = new BankingRepository();
