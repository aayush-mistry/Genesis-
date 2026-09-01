import { BankingEngine } from '../BankingEngine';
import { EventScheduler } from '../../events/EventScheduler';
import { TimeEngine } from '../../time/TimeEngine';
import { PrismaClient } from '@prisma/client';
import { LoanType, IBankingRepository } from '../types/BankingTypes';

const prisma = new PrismaClient();

class TestBankingRepository implements IBankingRepository {
    async createBank(data: any): Promise<any> { return prisma.bank.create({ data: { ...data, lendingCapacity: 0 } }); }
    async getBank(id: string): Promise<any> { return prisma.bank.findUnique({ where: { id } }); }
    async listBanks(): Promise<any[]> { return prisma.bank.findMany(); }
    async updateBankStats(id: string, updates: any): Promise<any> { return prisma.bank.update({ where: { id }, data: updates }); }
    async createAccount(data: any): Promise<any> { return prisma.bankAccount.create({ data }); }
    async getAccountByOwner(ownerId: string): Promise<any> { return prisma.bankAccount.findFirst({ where: { ownerId } }); }
    async getAccountById(accountId: string): Promise<any> { return prisma.bankAccount.findUnique({ where: { accountId } }); }
    async createLoanApplication(data: any): Promise<any> { return prisma.loanApplication.create({ data }); }
    async getLoanApplication(id: string): Promise<any> { return prisma.loanApplication.findUnique({ where: { id } }); }
    async updateLoanApplication(id: string, data: any): Promise<any> { return prisma.loanApplication.update({ where: { id }, data }); }
    async createLoan(data: any): Promise<any> { return prisma.loan.create({ data }); }
    async getLoan(id: string): Promise<any> { return prisma.loan.findUnique({ where: { id } }); }
    async listActiveLoans(): Promise<any[]> { return prisma.loan.findMany({ where: { status: { in: ['ACTIVE', 'PAST_DUE'] } } }); }
    async updateLoan(id: string, data: any): Promise<any> { return prisma.loan.update({ where: { id }, data }); }
    async createLoanPayment(data: any): Promise<any> { return prisma.loanPayment.create({ data }); }
    async getCreditHistory(ownerId: string): Promise<any> { return prisma.creditHistory.findUnique({ where: { ownerId } }); }
    async createOrUpdateCreditHistory(ownerId: string, score: number, eventStr: string): Promise<any> {
        const existing = await this.getCreditHistory(ownerId);
        if (existing) {
            let events: any[] = [];
            try { events = JSON.parse(existing.historyEventsJson); } catch(e) {}
            events.push({ event: eventStr, timestamp: Date.now() });
            return prisma.creditHistory.update({ where: { ownerId }, data: { creditScore: score, historyEventsJson: JSON.stringify(events) } });
        } else {
            return prisma.creditHistory.create({ data: { ownerId, creditScore: score, historyEventsJson: JSON.stringify([{ event: eventStr, timestamp: Date.now() }]) } });
        }
    }
    async executeTransaction<T>(fn: (tx: any) => Promise<T>): Promise<T> {
        return prisma.$transaction(fn);
    }
}

describe('BankingEngine', () => {
    let engine: BankingEngine;
    let scheduler: EventScheduler;
    let timeEngine: TimeEngine;
    let repo: TestBankingRepository;

    beforeEach(async () => {
        timeEngine = new TimeEngine();
        scheduler = new EventScheduler(timeEngine);
        repo = new TestBankingRepository();
        engine = new BankingEngine(scheduler, timeEngine, repo);

        // Clean up DB for test
        await prisma.loanPayment.deleteMany();
        await prisma.loan.deleteMany();
        await prisma.loanApplication.deleteMany();
        await prisma.bankAccount.deleteMany();
        await prisma.bank.deleteMany();
        await prisma.wallet.deleteMany();
        await prisma.creditHistory.deleteMany();
    });

    afterAll(async () => {
        await prisma.$disconnect();
    });

    test('should create a bank', async () => {
        const bank = await engine.createBank('Global Bank', 1000000);
        expect(bank.name).toBe('Global Bank');
        expect(bank.capital).toBe(1000000);
        expect(bank.reserves).toBe(1000000);
    });

    test('should allow deposit and withdrawal', async () => {
        const bank = await engine.createBank('Deposit Bank', 500000);
        const wallet = await prisma.wallet.create({ data: { ownerId: 'test-user', balance: 0, currency: 'CREDIT' } });
        
        const account = await repo.createAccount({
            accountId: 'test-account',
            bankId: bank.id,
            ownerId: 'test-user',
            walletId: wallet.id,
            accountType: 'CHECKING'
        });

        await engine.deposit('test-account', 5000);

        const updatedWallet = await prisma.wallet.findUnique({ where: { id: wallet.id } });
        expect(updatedWallet?.balance).toBe(5000);

        const updatedBank = await repo.getBank(bank.id);
        expect(updatedBank?.totalDeposits).toBe(5000);
        expect(updatedBank?.reserves).toBe(505000);

        await engine.withdraw('test-account', 2000);
        
        const finalWallet = await prisma.wallet.findUnique({ where: { id: wallet.id } });
        expect(finalWallet?.balance).toBe(3000);
    });

    test('should process loan application, approval, and EMI repayment', async () => {
        const bank = await engine.createBank('Lending Bank', 5000000);
        const wallet = await prisma.wallet.create({ data: { ownerId: 'borrower', balance: 0, currency: 'CREDIT' } });
        
        const account = await repo.createAccount({
            accountId: 'borrower-acc',
            bankId: bank.id,
            ownerId: 'borrower',
            walletId: wallet.id,
            accountType: 'CHECKING'
        });

        // Add some basic credit history to ensure they meet the minimum 600
        await repo.createOrUpdateCreditHistory('borrower', 650, 'INITIAL');

        const application = await engine.applyForLoan(
            bank.id,
            'borrower',
            LoanType.PERSONAL,
            10000,
            12,
            {
                incomeOrRevenue: 120000, // 10k/mo
                existingDebt: 0,
                existingEmiBurden: 0,
                creditScore: 650
            }
        );

        expect(application.status).toBe('APPROVED');

        // Verify money was created (wallet balance = 10000)
        const updatedWallet = await prisma.wallet.findUnique({ where: { id: wallet.id } });
        expect(updatedWallet?.balance).toBe(10000);

        const activeLoans = await repo.listActiveLoans();
        expect(activeLoans.length).toBe(1);
        const loan = activeLoans[0];
        expect(loan.principal).toBe(10000);

        // Process one month EMI
        await engine.processMonthlyEMIs();

        const postEmiWallet = await prisma.wallet.findUnique({ where: { id: wallet.id } });
        // EMI should be around 888.49
        expect(postEmiWallet?.balance).toBeLessThan(10000);
        expect(postEmiWallet?.balance).toBeGreaterThan(9000);

        const postEmiLoan = await repo.getLoan(loan.id);
        expect(postEmiLoan?.remainingPrincipal).toBeLessThan(10000);

        const ch = await repo.getCreditHistory('borrower');
        // Initial 650 -> -5 for approval -> +2 for EMI paid = 647
        expect(ch?.creditScore).toBe(647);
    });

    test('should reject loan if bank has insufficient capacity', async () => {
        const bank = await engine.createBank('Small Bank', 10000);
        const wallet = await prisma.wallet.create({ data: { ownerId: 'big-borrower', balance: 0, currency: 'CREDIT' } });
        
        await repo.createAccount({
            accountId: 'big-borrower-acc',
            bankId: bank.id,
            ownerId: 'big-borrower',
            walletId: wallet.id,
            accountType: 'CHECKING'
        });

        await repo.createOrUpdateCreditHistory('big-borrower', 750, 'INITIAL');

        const application = await engine.applyForLoan(
            bank.id,
            'big-borrower',
            LoanType.BUSINESS,
            50000, // Wants 50k, bank only has 10k capital (cap max 9k)
            60,
            {
                incomeOrRevenue: 1000000,
                existingDebt: 0,
                existingEmiBurden: 0,
                creditScore: 750
            }
        );

        expect(application.status).toBe('REJECTED');
        expect(application.eligibilityReasonsJson).toContain('insufficient lending capacity');
    });
});
