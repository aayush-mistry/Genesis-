import { persistenceService } from './src/services/persistence.service';
import { citizenService } from './src/services/citizen.service';
import { worldService } from './src/services/world.service';
import { supplyService } from './src/services/supply.service';
import { financialRepository } from './src/repositories/FinancialRepository';
import { prisma } from './src/repositories/prisma';
import { timeService } from './src/services/time.service';
import * as fs from 'fs';

async function run() {
  console.log('--- T5.7 RESTART VERIFICATION ---');
  
  if (!fs.existsSync('t5_7_state.json')) {
    console.error('FAIL: t5_7_state.json not found! Run verify_t5_7.ts first.');
    process.exit(1);
  }
  const state = JSON.parse(fs.readFileSync('t5_7_state.json', 'utf8'));
  console.log('Loaded previous state:', state);

  console.log('\n[1] Bootstrapping Genesis Backend (Hydration)...');
  await persistenceService.bootstrap();
  
  // Disable background simulators
  citizenService['simulator'].stop();
  
  console.log('\n[2] Verifying Hydrated Entities...');
  
  const citizen = citizenService.engine.getCitizen(state.citizenId);
  if (!citizen) {
    console.error(`FAIL: Citizen ${state.citizenId} failed to hydrate!`);
    process.exit(1);
  }
  
  const allStores = worldService.engine.workplaceRepository.findAll();
  console.log('Stores in repository:', allStores.map(s => s.id));
  
  const store = worldService.engine.workplaceRepository.findById(state.storeId);
  if (!store) {
    console.error(`FAIL: Store ${state.storeId} failed to hydrate!`);
    process.exit(1);
  }
  
  console.log('\n[3] Verifying Financial State...');
  const citizenWalletDb = await prisma.wallet.findUnique({ where: { ownerId: state.citizenId } });
  const storeWalletDb = await prisma.wallet.findUnique({ where: { ownerId: state.storeId } });
  
  if (!citizenWalletDb || !storeWalletDb) {
    console.error(`FAIL: Wallets failed to hydrate!`);
    process.exit(1);
  }
  
  const totalMoney = citizenWalletDb.balance + storeWalletDb.balance;
  console.log(`Citizen Money: ${citizenWalletDb.balance} (Expected: ${state.finalCitizenMoney})`);
  console.log(`Store Money: ${storeWalletDb.balance} (Expected: ${state.finalStoreMoney})`);
  console.log(`Total Money: ${totalMoney} (Expected: ${state.totalMoneyFinal})`);
  
  const moneyPass = totalMoney === state.totalMoneyFinal && citizenWalletDb.balance === state.finalCitizenMoney && storeWalletDb.balance === state.finalStoreMoney;
  console.log(`Money Conservation: ${moneyPass ? 'PASS' : 'FAIL'}`);
  
  console.log('\n[4] Verifying Inventory State...');
  const citizenInv = supplyService.inventoryManager.getInventoryByOwner(state.citizenId);
  const storeInv = supplyService.inventoryManager.getInventoryByOwner(state.storeId);
  
  if (!citizenInv || !storeInv) {
    console.error(`FAIL: Inventories failed to hydrate!`);
    process.exit(1);
  }
  
  const currentTime = timeService.engine.getCurrentTime();
  const currentSeconds = Math.floor(new Date(currentTime.year, currentTime.month - 1, currentTime.day, currentTime.hour, currentTime.minute, currentTime.second).getTime() / 1000);
  
  const citizenFood = supplyService.inventoryManager.getUsableQuantity(citizenInv.id, 'food', currentSeconds);
  const storeFood = supplyService.inventoryManager.getUsableQuantity(storeInv.id, 'food', currentSeconds);
  const totalFood = citizenFood + storeFood;
  
  console.log(`Citizen Food: ${citizenFood} (Expected: ${state.finalCitizenFood})`);
  console.log(`Store Food: ${storeFood} (Expected: ${state.finalStoreFood})`);
  console.log(`Total Food: ${totalFood} (Expected: ${state.totalFoodFinal})`);
  
  const foodPass = totalFood === state.totalFoodFinal && citizenFood === state.finalCitizenFood && storeFood === state.finalStoreFood;
  console.log(`Food Conservation: ${foodPass ? 'PASS' : 'FAIL'}`);
  
  if (!moneyPass || !foodPass) {
    console.error('\nFAIL! Conservation mismatched after hydration.');
    process.exit(1);
  }

  console.log('\n[5] Executing Continuation Test (Post-Restart Action)...');

  // We need to re-setup the executors and seeds that aren't natively persisted yet
  const { marketService } = require('./src/services/market.service');
  const { spatialService } = require('./src/services/spatial.service');
  const { StoreRanker } = require('../packages/engine/src/decision/scoring/StoreRanker');
  
  // Seed commodity for consumption engine again (normally done by game init, not fully persisted)
  supplyService.productionEngine.commodities.set('food', {
    id: 'food',
    name: 'Food',
    category: 'CONSUMABLE',
    basePrice: 10,
    consumable: {
      restorationNeed: 'HUNGER',
      restorationValue: 10
    }
  } as any);

  const storeRanker = new StoreRanker(marketService.engine, supplyService.inventoryManager);
  citizenService.engine.actionExecutor.setMarketEngine(
    marketService.engine,
    storeRanker,
    spatialService.engine.queryService
  );

  const ActionType = { PURCHASE: 'PURCHASE', CONSUME_FOOD: 'CONSUME_FOOD' };
  const ActionState = { PENDING: 'PENDING', COMPLETED: 'COMPLETED' };

  const purchaseAction = {
    type: ActionType.PURCHASE,
    state: ActionState.PENDING,
    priority: 10,
    target: { type: 'BUILDING', id: store.id },
    metadata: { productId: 'food', targetQuantity: 5, selectedStoreId: store.id },
    createdAt: new Date() as any,
  };

  citizenService.engine.actionExecutor.executeAction(citizen, purchaseAction);
  
  for (let i = 0; i < 5; i++) {
    citizenService.engine.actionExecutor.tick(citizen);
  }

  const currentPurchaseAction = citizen.currentAction!;
  if (currentPurchaseAction.state !== ActionState.COMPLETED) {
    console.error(`Post-Restart Purchase failed! State is: ${currentPurchaseAction.state}`);
  } else {
    console.log('Post-Restart Purchase Action Completed Successfully.');
  }

  const postCitizenMoney = citizen.wallet!.balance;
  const postStoreMoney = store.wallet!.balance;
  const postCitizenFood = supplyService.inventoryManager.getUsableQuantity(citizenInv.id, 'food', currentSeconds);
  const postStoreFood = supplyService.inventoryManager.getUsableQuantity(storeInv.id, 'food', currentSeconds);

  console.log(`Post-Restart State:
  Citizen Money: ${postCitizenMoney} (Expected: ${citizenWalletDb.balance - 50})
  Store Money: ${postStoreMoney} (Expected: ${storeWalletDb.balance + 50})
  Citizen Food: ${postCitizenFood} (Expected: ${citizenFood + 5})
  Store Food: ${postStoreFood} (Expected: ${storeFood - 5})`);

  if (
    postCitizenMoney === citizenWalletDb.balance - 50 &&
    postStoreMoney === storeWalletDb.balance + 50 &&
    postCitizenFood === citizenFood + 5 &&
    postStoreFood === storeFood - 5
  ) {
    console.log('\nSUCCESS! T5.7 CLOSED-LOOP ECONOMIC VERIFICATION COMPLETED SUCCESSFULLY!');
    process.exit(0);
  } else {
    console.error('\nFAIL! Post-restart action failed to mutate state correctly.');
    process.exit(1);
  }
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
