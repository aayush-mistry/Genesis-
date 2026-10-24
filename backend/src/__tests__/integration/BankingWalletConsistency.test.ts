// Ensure isolated test database is used BEFORE anything else is loaded
if (!process.env.DATABASE_URL || !process.env.DATABASE_URL.includes('isolated')) {
  process.env.DATABASE_URL = 'file:D:/Total Gaming/genesis/backend/prisma/isolated_banking.db';
}

import { prisma } from '../../repositories/prisma';
import { persistenceService } from '../../services/persistence.service';
import { bankingService } from '../../services/banking.service';
import { citizenService } from '../../services/citizen.service';
import { marketService } from '../../services/market.service';
import { financeService } from '../../services/finance.service';
import { worldService } from '../../services/world.service';
import { timeService } from '../../services/time.service';
import { citizenRepository, financialRepository, bankingRepository, worldRepository } from '../../repositories';

describe('T8.6.6.2 Banking Engine & In-Memory Wallet Consistency Integration', () => {
  jest.setTimeout(60000);

  const testWorldId = 'test-world-banking-consistency';
  const testRegionId = 'test-region-banking-consistency';
  const testCitizenId = 'citizen-banking-authoritative-1';

  let bankId: string;
  let accountId: string;
  let applicationId: string;
  let loanId: string;
  const initialCitizenBalance = 50000;
  const bankCapital = 1000000;
  const loanAmount = 10000;

  beforeAll(async () => {
    // 1. Clean isolated test database
    await prisma.loanPayment.deleteMany();
    await prisma.loan.deleteMany();
    await prisma.loanApplication.deleteMany();
    await prisma.bankAccount.deleteMany();
    await prisma.bank.deleteMany();
    await prisma.transactionRecord.deleteMany();
    await prisma.wallet.deleteMany();
    await prisma.citizen.deleteMany();
    await prisma.region.deleteMany();
    await prisma.world.deleteMany();
    await prisma.simulationState.deleteMany();
    await prisma.simulationEvent.deleteMany();
    await prisma.creditHistory.deleteMany();

    // 2. Setup simulation state and world with activeWorldId so persistence bootstrap hydrations succeed
    await prisma.simulationState.create({
      data: { id: 'singleton', activeWorldId: testWorldId, year: 1, month: 2, day: 15, speed: 1 }
    });

    await worldRepository.createWorld({
      id: testWorldId,
      name: 'Banking Consistency World',
      description: 'World for banking persistence integration tests',
      randomSeed: 998877,
      creationTime: 100,
      worldSize: 1000,
      width: 1000,
      height: 1000,
      climateProfile: 'TEMPERATE',
      timeZone: 'UTC',
      version: '1.0.0',
      status: 'ACTIVE'
    });

    await prisma.region.create({
      data: {
        id: testRegionId,
        worldId: testWorldId,
        name: 'Banking Region',
        description: 'Test region for banking',
        climate: 'TEMPERATE',
        coordX: 0,
        coordY: 0,
        width: 1000,
        height: 1000
      }
    });

    // 3. Create test citizen and wallet in DB
    const citizen = await citizenRepository.createCitizen({
      id: testCitizenId,
      name: 'Authoritative Citizen',
      gender: 'FEMALE',
      status: 'ALIVE',
      birthDateJson: '{}',
      createdAtSimJson: '{}',
      vitalStateJson: '{}',
      personalityJson: '{}',
      movementState: 'IDLE',
      skillsJson: '{}',
      employmentStatus: 'UNEMPLOYED'
    });

    const citizenWallet = await financialRepository.createWallet(testCitizenId);
    await prisma.wallet.update({
      where: { id: citizenWallet.id },
      data: { balance: initialCitizenBalance }
    });

    await prisma.creditHistory.create({
      data: { ownerId: testCitizenId, creditScore: 720, historyEventsJson: '[]' }
    });

    // 4. Create Bank and Bank Account
    const bank = await bankingRepository.createBank({
      name: 'Consistency Test Bank',
      capital: bankCapital,
      reserves: bankCapital,
      totalDeposits: 0
    });
    bankId = bank.id;

    const account = await bankingRepository.createAccount({
      accountId: 'ACC-CONSISTENCY-001',
      bankId: bank.id,
      ownerId: testCitizenId,
      walletId: citizenWallet.id,
      accountType: 'CHECKING'
    });
    accountId = account.accountId;

    // 5. Bootstrap PersistenceService and initialize BankingService & FinanceService
    financeService.initialize();
    await persistenceService.bootstrap();
    await bankingService.initialize();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  test('1. Initial authoritative in-memory state matches database before banking operations', async () => {
    // Citizen authoritative wallet in CitizenService
    const inMemCitizen = citizenService.engine.getCitizen(testCitizenId);
    expect(inMemCitizen).toBeDefined();
    expect(inMemCitizen?.wallet).toBeDefined();
    expect(inMemCitizen?.wallet?.balance).toBe(initialCitizenBalance);

    // Citizen wallet in MarketEngine
    const marketWallet = marketService.engine.getWallet(testCitizenId);
    expect(marketWallet).toBeDefined();
    expect(marketWallet?.balance).toBe(initialCitizenBalance);

    // Bank authoritative wallet in MarketEngine
    const bankWallet = marketService.engine.getWallet(bankId);
    expect(bankWallet).toBeDefined();
    expect(bankWallet?.balance).toBe(bankCapital);

    // Total economy money
    const totalCash = (marketWallet?.balance ?? 0) + (bankWallet?.balance ?? 0);
    expect(totalCash).toBe(initialCitizenBalance + bankCapital);
  });

  test('2. Loan disbursement updates the authoritative in-memory wallet and conserves money', async () => {
    const application = await bankingService.engine.applyForLoan(
      bankId,
      testCitizenId,
      'PERSONAL' as any,
      loanAmount,
      12,
      { monthlyIncome: 8000, monthlyExpenses: 2500, creditScore: 720 }
    );

    expect(application).toBeDefined();
    expect(application.status).toBe('APPROVED');
    applicationId = application.id;

    // Check in-memory citizen wallet updated
    const inMemCitizen = citizenService.engine.getCitizen(testCitizenId);
    expect(inMemCitizen?.wallet?.balance).toBe(initialCitizenBalance + loanAmount);

    // Check MarketEngine citizen wallet updated
    const marketWallet = marketService.engine.getWallet(testCitizenId);
    expect(marketWallet?.balance).toBe(initialCitizenBalance + loanAmount);

    // Check Bank authoritative wallet debited
    const bankWallet = marketService.engine.getWallet(bankId);
    expect(bankWallet?.balance).toBe(bankCapital - loanAmount);

    // Check Money Conservation
    const totalCashAfterLoan = (marketWallet?.balance ?? 0) + (bankWallet?.balance ?? 0);
    expect(totalCashAfterLoan).toBe(initialCitizenBalance + bankCapital);

    // Check SQLite matches authoritative in-memory immediately
    const dbCitizenWallet = await financialRepository.getWalletByOwner(testCitizenId);
    expect(dbCitizenWallet?.balance).toBe(initialCitizenBalance + loanAmount);

    const dbBankWallet = await financialRepository.getWalletByOwner(bankId);
    expect(dbBankWallet?.balance).toBe(bankCapital - loanAmount);

    // Check Loan record created in DB
    const activeLoans = await bankingRepository.listActiveLoans();
    expect(activeLoans.length).toBe(1);
    const loan = activeLoans[0];
    loanId = loan.id;
    expect(loan.principal).toBe(loanAmount);
    expect(loan.remainingPrincipal).toBe(loanAmount);
    expect(loan.status).toBe('ACTIVE');

    // Check transaction record created for audit
    expect(marketService.engine.hasTransaction(`LOAN-DISBURSE-${application.id}`)).toBe(true);
  });

  test('3. Persisted balance matches in-memory balance after repeated persistence ticks (no erasure)', async () => {
    // Tick 1
    await persistenceService.persistTickBoundary();

    const dbWalletTick1 = await financialRepository.getWalletByOwner(testCitizenId);
    expect(dbWalletTick1?.balance).toBe(initialCitizenBalance + loanAmount);

    const inMemCitizenTick1 = citizenService.engine.getCitizen(testCitizenId);
    expect(inMemCitizenTick1?.wallet?.balance).toBe(initialCitizenBalance + loanAmount);

    // Tick 2
    await persistenceService.persistTickBoundary();

    // Tick 3
    await persistenceService.persistTickBoundary();

    const dbWalletTick3 = await financialRepository.getWalletByOwner(testCitizenId);
    expect(dbWalletTick3?.balance).toBe(initialCitizenBalance + loanAmount);
    expect(inMemCitizenTick1?.wallet?.balance).toBe(initialCitizenBalance + loanAmount);
  });

  test('4. Cold restart hydrates the same authoritative wallet balance and loan liability', async () => {
    // Simulate cold restart by clearing in-memory services and re-bootstrapping
    worldService.engine.reset();
    marketService.engine.reset();
    citizenService.engine.clear();

    // Verify in-memory is cleared
    expect(citizenService.engine.getCitizen(testCitizenId)).toBeUndefined();
    expect(marketService.engine.getWallet(testCitizenId)).toBeUndefined();

    // Re-bootstrap
    await persistenceService.bootstrap();
    await bankingService.initialize();

    // Verify hydrated in-memory state
    const hydratedCitizen = citizenService.engine.getCitizen(testCitizenId);
    expect(hydratedCitizen).toBeDefined();
    expect(hydratedCitizen?.wallet?.balance).toBe(initialCitizenBalance + loanAmount);

    const hydratedMarketWallet = marketService.engine.getWallet(testCitizenId);
    expect(hydratedMarketWallet?.balance).toBe(initialCitizenBalance + loanAmount);

    const hydratedBankWallet = marketService.engine.getWallet(bankId);
    expect(hydratedBankWallet?.balance).toBe(bankCapital - loanAmount);

    // Verify loan liability in DB
    const activeLoans = await bankingRepository.listActiveLoans();
    expect(activeLoans.length).toBe(1);
    expect(activeLoans[0].remainingPrincipal).toBe(loanAmount);
    expect(activeLoans[0].status).toBe('ACTIVE');
  });

  test('5. Repayment updates both the wallet and outstanding liability correctly and conserves money', async () => {
    const loan = (await bankingRepository.listActiveLoans())[0];
    const emi = loan.monthlyEmi;
    const initialRemainingPrincipal = loan.remainingPrincipal;
    const annualRate = loan.interestRate;

    const expectedInterest = Math.round((initialRemainingPrincipal * annualRate / 12) * 100) / 100;
    const expectedPrincipalPortion = emi - expectedInterest;
    const expectedNewPrincipal = initialRemainingPrincipal - expectedPrincipalPortion;
    const expectedCitizenBal = (initialCitizenBalance + loanAmount) - emi;
    const expectedBankBal = (bankCapital - loanAmount) + emi;

    // Process EMI
    await bankingService.engine.processMonthlyEMIs();

    // Check borrower in-memory wallet
    const inMemCitizen = citizenService.engine.getCitizen(testCitizenId);
    expect(Math.abs((inMemCitizen?.wallet?.balance ?? 0) - expectedCitizenBal)).toBeLessThan(0.01);

    // Check borrower MarketEngine wallet
    const marketWallet = marketService.engine.getWallet(testCitizenId);
    expect(Math.abs((marketWallet?.balance ?? 0) - expectedCitizenBal)).toBeLessThan(0.01);

    // Check bank in-memory wallet
    const bankWallet = marketService.engine.getWallet(bankId);
    expect(Math.abs((bankWallet?.balance ?? 0) - expectedBankBal)).toBeLessThan(0.01);

    // Verify Money Conservation
    const totalCash = (marketWallet?.balance ?? 0) + (bankWallet?.balance ?? 0);
    expect(Math.abs(totalCash - (initialCitizenBalance + bankCapital))).toBeLessThan(0.01);

    // Check SQLite wallet updated immediately
    const dbCitizenWallet = await financialRepository.getWalletByOwner(testCitizenId);
    expect(Math.abs((dbCitizenWallet?.balance ?? 0) - expectedCitizenBal)).toBeLessThan(0.01);

    // Check loan liability updated in SQLite
    const updatedLoan = await bankingRepository.getLoan(loan.id);
    expect(Math.abs((updatedLoan?.remainingPrincipal ?? 0) - expectedNewPrincipal)).toBeLessThan(0.01);
    expect(updatedLoan?.status).toBe('ACTIVE');

    // Run persistence tick
    await persistenceService.persistTickBoundary();

    const dbWalletAfterTick = await financialRepository.getWalletByOwner(testCitizenId);
    expect(Math.abs((dbWalletAfterTick?.balance ?? 0) - expectedCitizenBal)).toBeLessThan(0.01);
  });

  test('6. Replaying the same operation does not apply repayment or disbursement twice (idempotency)', async () => {
    const loan = (await bankingRepository.listActiveLoans())[0];
    const balanceBeforeReplay = citizenService.engine.getCitizen(testCitizenId)?.wallet?.balance ?? 0;
    const remainingPrincipalBeforeReplay = loan.remainingPrincipal;

    const paymentsBefore = await prisma.loanPayment.findMany({ where: { loanId: loan.id } });
    expect(paymentsBefore.length).toBe(1);

    // Replay EMI processing at the exact same simulation time
    await bankingService.engine.processMonthlyEMIs();

    // Verify NO double deduction or payment record
    const inMemCitizen = citizenService.engine.getCitizen(testCitizenId);
    expect(inMemCitizen?.wallet?.balance).toBe(balanceBeforeReplay);

    const paymentsAfter = await prisma.loanPayment.findMany({ where: { loanId: loan.id } });
    expect(paymentsAfter.length).toBe(1);

    const loanAfter = await bankingRepository.getLoan(loan.id);
    expect(loanAfter?.remainingPrincipal).toBe(remainingPrincipalBeforeReplay);

    // Replay Loan Disbursement
    await (bankingService.engine as any).approveAndIssueLoan(applicationId);

    const citizenWalletAfterDisburseReplay = citizenService.engine.getCitizen(testCitizenId)?.wallet?.balance;
    expect(citizenWalletAfterDisburseReplay).toBe(balanceBeforeReplay);

    const activeLoans = await bankingRepository.listActiveLoans();
    expect(activeLoans.length).toBe(1);
  });

  test('7. Insufficient funds leaves no partial financial or liability changes', async () => {
    const loan = (await bankingRepository.listActiveLoans())[0];
    const emi = loan.monthlyEmi;
    const remainingPrincipalBefore = loan.remainingPrincipal;
    const bankBalBefore = marketService.engine.getWallet(bankId)?.balance ?? 0;

    // Set citizen wallet to 10 (less than monthly EMI)
    const inMemCitizen = citizenService.engine.getCitizen(testCitizenId);
    if (inMemCitizen?.wallet) {
      inMemCitizen.wallet.balance = 10;
    }
    await financialRepository.updateWallet(testCitizenId, 10, 0, 0);

    // Advance simulation time by 1 month to simulate next billing cycle
    const curTime = timeService.engine.getCurrentTime();
    timeService.engine.setCurrentTime({
      ...curTime,
      month: curTime.month + 1 > 12 ? 1 : curTime.month + 1,
      year: curTime.month + 1 > 12 ? curTime.year + 1 : curTime.year
    });

    // Process EMI with insufficient funds
    await bankingService.engine.processMonthlyEMIs();

    // Verify wallet balance is UNTOUCHED (still 10, no partial deduction!)
    expect(inMemCitizen?.wallet?.balance).toBe(10);
    const dbWallet = await financialRepository.getWalletByOwner(testCitizenId);
    expect(dbWallet?.balance).toBe(10);

    // Verify bank balance was NOT credited
    const bankWallet = marketService.engine.getWallet(bankId);
    expect(bankWallet?.balance).toBe(bankBalBefore);

    // Verify loan principal was NOT decremented
    const updatedLoan = await bankingRepository.getLoan(loan.id);
    expect(updatedLoan?.remainingPrincipal).toBe(remainingPrincipalBefore);

    // Verify loan status updated to PAST_DUE
    expect(updatedLoan?.status).toBe('PAST_DUE');
    expect(updatedLoan?.missedPayments).toBe(1);

    // Verify NO partial loan payment record created
    const simTime = timeService.engine.getCurrentTime();
    const timestamp = simTime.year * 10000 + simTime.month * 100 + simTime.day;
    const payment = await prisma.loanPayment.findFirst({ where: { loanId: loan.id, timestamp } });
    expect(payment).toBeNull();
  });
});
