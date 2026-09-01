import { prisma } from './src/repositories/prisma';
import { persistenceService } from './src/services/persistence.service';
import { financialRepository, inventoryRepository, citizenRepository } from './src/repositories';

async function runPersistenceTest() {
  console.log('--- BEGIN PERSISTENCE TEST ---');
  
  // Clean up
  await prisma.citizen.deleteMany();
  await prisma.wallet.deleteMany();
  await prisma.inventory.deleteMany();
  await prisma.simulationState.deleteMany();

  console.log('1. Setting up initial persisted state...');
  
  await prisma.simulationState.create({
    data: { id: 'singleton', year: 1, month: 2, day: 15, speed: 1 }
  });

  const citizen = await citizenRepository.createCitizen({
    id: 'test-citizen-1', 
    name: 'Test Citizen', 
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
    data: { balance: 4375 }
  });

  const inventory = await inventoryRepository.createInventory({
    ownerId: citizen.id,
    storageCapacity: 100
  });

  await inventoryRepository.upsertItem(inventory.id, 'food', 35, 'kg');

  console.log('2. Starting Backend Bootstrap (Hydration)...');
  await persistenceService.bootstrap();
  
  console.log('\n--- VERIFYING EXACT VALUES ---');
  
  const postWallet = await financialRepository.getWalletByOwner(citizen.id);
  console.log(`Wallet Balance: ${postWallet ? postWallet.balance : 'N/A'} GEN (Expected: 4375)`);
  if (!postWallet || postWallet.balance !== 4375) throw new Error("Wallet balance was not conserved!");

  const postInventory = await inventoryRepository.getInventoryByOwner(citizen.id);
  const foodItem = postInventory ? postInventory.items.find((i: any) => i.productId === 'food') : undefined;
  console.log(`Inventory Food Quantity: ${foodItem ? foodItem.totalQuantity : 'N/A'} kg (Expected: 35)`);
  if (!foodItem || foodItem.totalQuantity !== 35) throw new Error("Inventory quantity was not conserved!");

  console.log('--- PERSISTENCE TEST PASSED ---');
}

runPersistenceTest().catch(console.error).finally(() => prisma.$disconnect());
