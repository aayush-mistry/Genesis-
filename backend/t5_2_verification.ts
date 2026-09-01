import { prisma } from './src/repositories/prisma';
import { persistenceService } from './src/services/persistence.service';
import { citizenRepository, inventoryRepository } from './src/repositories';
import { citizenService } from './src/services/citizen.service';
import { supplyService } from './src/services/supply.service';
import { timeService } from './src/services/time.service';
import { ActionType, ActionState, SimulationTime, ProductCategory } from '@genesis/shared';
import { TimeUtils } from '@genesis/engine/src/utils/TimeUtils';

async function setupDatabase() {
  console.log('--- Cleaning database ---');
  await prisma.citizen.deleteMany();
  await prisma.wallet.deleteMany();
  await prisma.inventoryItem.deleteMany();
  await prisma.inventory.deleteMany();
  await prisma.simulationState.deleteMany();

  console.log('--- Setting up persistent state ---');
  await prisma.simulationState.create({
    data: { id: 'singleton', year: 1, month: 1, day: 1, speed: 1 }
  });

  const time = { year: 1, month: 1, day: 1, hour: 8, minute: 0, second: 0 };

  const vitalState = { hunger: 50, thirst: 50, energy: 50, health: 50, lastUpdatedSimulationTime: time };

  const citizen = await citizenRepository.createCitizen({
    id: 'test-citizen-1', 
    name: 'Test Citizen', 
    gender: 'MALE', 
    status: 'ACTIVE',
    birthDateJson: JSON.stringify(time),
    createdAtSimJson: JSON.stringify(time),
    vitalStateJson: JSON.stringify(vitalState),
    personalityJson: '{}',
    movementState: 'IDLE',
    skillsJson: '[]',
    employmentStatus: 'UNEMPLOYED'
  });

  const inventory = await inventoryRepository.createInventory({
    id: 'test-inv-1',
    ownerId: citizen.id,
    storageCapacity: 100
  });

  await inventoryRepository.upsertItem(inventory.id, 'food', 35, 'kg');
  console.log('Initial DB state: Citizen created with 35kg food');
}

async function runPhase1() {
  console.log('\n--- PHASE 1: Execution & Memory Verification ---');
  await setupDatabase();

  // Boot persistence
  await persistenceService.bootstrap();
  // Ensure commodities exist
  supplyService.productionEngine.registerCommodity({
    id: 'food', name: 'Food', category: ProductCategory.FOOD, isBiological: true, basePrice: 5, unit: 'kg',
    consumable: { restorationNeed: 'HUNGER', restorationValue: 10 }
  });

  const { ConsumptionEngine } = require('@genesis/engine');
  const getCommodity = (id: string) => supplyService.productionEngine.commodities.get(id);
  const consumptionEngine = new ConsumptionEngine(
    supplyService.inventoryManager,
    citizenService.engine.needsService,
    getCommodity
  );
  citizenService.engine.actionExecutor.setConsumptionEngine(consumptionEngine);

  // Get hydrated citizen
  const engineCitizen = citizenService.engine.getCitizen('test-citizen-1');
  if (!engineCitizen) throw new Error('Citizen not hydrated!');

  const inventory = supplyService.inventoryManager.getInventory('test-inv-1');
  if (!inventory) throw new Error('Inventory not hydrated!');

  console.log(`Initial Memory -> Hunger: ${engineCitizen.vitalState.hunger}, Food: ${inventory.items['food'] ? inventory.items['food'].totalQuantity : 'N/A'} kg`);

  // Force consumption of 2 units (requires 20 hunger restoration to reach default target 20)
  engineCitizen.vitalState.hunger = 40;
  
  const actionInstance = citizenService.engine.actionExecutor.executeAction(engineCitizen, {
    type: ActionType.CONSUME_FOOD,
    target: { type: 'PRODUCT', id: 'food' },
    source: 'test-inv-1',
    reason: 'Hunger low'
  });

  console.log('Action State after start:', engineCitizen.currentAction ? engineCitizen.currentAction.state : 'N/A');

  // Advance time by 1 hour to complete action
  timeService.engine.advance(3600);

  console.log('Executing tick...');
  citizenService.engine.actionExecutor.tick(engineCitizen);

  console.log(`Action State after tick:`, engineCitizen.currentAction ? engineCitizen.currentAction.state : 'N/A');
  console.log(`Post-Action Memory -> Hunger: ${engineCitizen.vitalState.hunger}, Food: ${inventory.items['food'] ? inventory.items['food'].totalQuantity : 'N/A'} kg`);

  if (!inventory.items['food'] || inventory.items['food'].totalQuantity !== 33) {
    throw new Error('Food in memory is not 33 kg!');
  }

  // Get dirty citizens
  const dirtySet = (citizenService.engine['repository'] as any).dirtySet;
  const dirtyCitizens = dirtySet ? Array.from(dirtySet) : ['(No dirtySet property, fallback needed)'];
  console.log(`Dirty citizens: ${dirtyCitizens.join(', ')}`);

  console.log('\n--- Executing Tick Persistence Boundary ---');
  await persistenceService.persistTickBoundary({
    citizens: dirtySet || new Set(['test-citizen-1'])
  });

  console.log('\n--- Verifying SQLite Directly ---');
  const dbInventory = await inventoryRepository.getInventoryByOwner('test-citizen-1');
  const foodItem = dbInventory?.items.find((i: any) => i.productId === 'food');
  console.log(`SQLite Food: ${foodItem?.totalQuantity} kg`);

  if (foodItem?.totalQuantity !== 33) {
    console.error('ERROR: SQLite did NOT contain 33 kg! (BUG DETECTED)');
    process.exit(1);
  }
}

async function runPhase2() {
  console.log('\n--- PHASE 2: Restart Recovery Verification ---');
  // Re-bootstrap to simulate restart
  // We can just create a new instance or clean the current in-memory engine
  citizenService.engine['repository'].clear();
  supplyService.inventoryManager['inventories'].clear();

  await persistenceService.bootstrap();
  
  const engineCitizen = citizenService.engine.getCitizen('test-citizen-1');
  const inventory = supplyService.inventoryManager.getInventory('test-inv-1');
  
  console.log(`Recovered Memory -> Hunger: ${engineCitizen?.vitalState.hunger}, Food: ${inventory?.items['food']?.totalQuantity} kg`);

  if (inventory?.items['food']?.totalQuantity !== 33) {
    throw new Error('Hydrated food is not 33 kg!');
  }
  
  console.log('--- ALL VERIFICATIONS PASSED ---');
}

async function main() {
  try {
    await runPhase1();
    await runPhase2();
  } catch (e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
  }
}

main();
