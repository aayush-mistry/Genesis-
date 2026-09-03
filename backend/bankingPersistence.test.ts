import { prisma } from './src/repositories/prisma';
import { persistenceService } from './src/services/persistence.service';
import { bankingService } from './src/services/banking.service';
import { citizenRepository, financialRepository, bankingRepository } from './src/repositories';
import { timeService } from './src/services/time.service';

async function runBankingPersistenceTest() {
  console.log('--- BEGIN BANKING PERSISTENCE TEST ---');
  
  // Clean up
  await prisma.loanPayment.deleteMany();
  await prisma.loan.deleteMany();
  await prisma.loanApplication.deleteMany();
  await prisma.bankAccount.deleteMany();
  await prisma.bank.deleteMany();
  await prisma.wallet.deleteMany();
  await prisma.citizen.deleteMany();
  await prisma.simulationState.deleteMany();
  await prisma.simulationEvent.deleteMany();
  await prisma.creditHistory.deleteMany();

  console.log('1. Setting up initial persisted state...');
  
  await prisma.simulationState.create({
    data: { id: 'singleton', year: 1, month: 2, day: 15, speed: 1 }
  });

  const citizen = await citizenRepository.createCitizen({
    id: 'test-citizen-banking', 
    name: 'Test Citizen Banking', 
    gender: 'MALE', 
    status: 'ALIVE',
    birthDateJson: '{}',
    createdAtSimJson: '{}',
    vitalStateJson: '{}',
    personalityJson: '{}',
    movementState: 'IDLE',
    skillsJson: '{}',
    employmentStatus: 'UNEMPLOYED'
  });

  const wallet = await financialRepository.createWallet(citizen.id);
  await prisma.wallet.update({
    where: { id: wallet.id },
    data: { balance: 50000 }
  });

  await prisma.creditHistory.create({
    data: { ownerId: citizen.id, creditScore: 700, historyEventsJson: "[]" }
  });

  // Create Bank
  const bank = await bankingRepository.createBank({
    name: "Test Bank",
    capital: 1000000,
    reserves: 1000000,
    totalDeposits: 0
  });
  
  // Create Bank Account
  const bankAccount = await bankingRepository.createAccount({
    accountId: "ACC-TEST-123",
    bankId: bank.id,
    ownerId: citizen.id,
    walletId: wallet.id,
    accountType: "CHECKING"
  });

  console.log('2. Starting Backend Bootstrap (Hydration)...');
  await persistenceService.bootstrap();
  bankingService.initialize();

  // Create a loan through engine
  console.log('3. Applying for a Loan...');
  const application = await bankingService.engine.applyForLoan(
    bank.id,
    citizen.id,
    'PERSONAL',
    10000,
    12,
    { monthlyIncome: 5000, monthlyExpenses: 2000, creditScore: 700 }
  );
  console.log(`Loan Application Status: ${application?.status}`);
  if (application?.status === 'REJECTED') {
      console.log(`Reasons: ${application.eligibilityReasonsJson}`);
  }

  const activeLoans = await bankingRepository.listActiveLoans();
  if (activeLoans.length !== 1) {
    throw new Error(`Expected 1 active loan, found ${activeLoans.length}`);
  }
  const loan = activeLoans[0];
  
  console.log(`Loan Created: Principal=${loan.principal}, EMI=${loan.monthlyEmi}, InterestRate=${loan.interestRate}`);
  
  const initialWallet = await financialRepository.getWalletByOwner(citizen.id);
  if (!initialWallet || initialWallet.balance !== 60000) {
    throw new Error(`Expected wallet balance to be 60000 after loan issue, got ${initialWallet?.balance}`);
  }

  console.log('4. Processing Monthly EMI...');
  // Force process monthly EMI
  await bankingService.engine.processMonthlyEMIs();
  
  const payments = await prisma.loanPayment.findMany();
  if (payments.length !== 1) {
    throw new Error(`Expected 1 loan payment, found ${payments.length}`);
  }
  
  const walletAfterEmi = await financialRepository.getWalletByOwner(citizen.id);
  const expectedBalance = 60000 - loan.monthlyEmi;
  if (!walletAfterEmi || Math.abs(walletAfterEmi.balance - expectedBalance) > 0.1) {
    throw new Error(`Expected wallet balance ~${expectedBalance}, got ${walletAfterEmi?.balance}`);
  }
  console.log(`EMI Processed successfully. Balance: ${walletAfterEmi.balance}`);
  
  console.log('5. Restart Continuation Test (Exactly-Once)...');
  // Process EMI again without changing simulation time, expecting NO duplicate payment
  await bankingService.engine.processMonthlyEMIs();
  
  const paymentsAfterDuplicateCall = await prisma.loanPayment.findMany();
  if (paymentsAfterDuplicateCall.length !== 1) {
    throw new Error(`Expected NO duplicate loan payments, found ${paymentsAfterDuplicateCall.length}`);
  }
  
  const walletAfterDuplicateCall = await financialRepository.getWalletByOwner(citizen.id);
  if (!walletAfterDuplicateCall || Math.abs(walletAfterDuplicateCall.balance - expectedBalance) > 0.1) {
    throw new Error(`Expected wallet balance to remain ~${expectedBalance}, got ${walletAfterDuplicateCall?.balance}`);
  }
  
  console.log('6. Verify Restart Event Duplication Fix...');
  // Re-initialize to simulate restart again
  bankingService.initialize();
  // Verify that only one monthly-emi-processing event is scheduled
  const scheduler = (bankingService as any).engine.scheduler;
  const events = scheduler.getUpcomingEvents().filter((e: any) => e.id.startsWith('monthly-emi-processing'));
  if (events.length > 1) {
    throw new Error(`Found duplicated monthly-emi-processing events: ${events.length}`);
  }
  
  console.log('\n--- BANKING PERSISTENCE TEST PASSED ---');
}

runBankingPersistenceTest().catch(console.error).finally(() => prisma.$disconnect());
