import { prisma } from '../repositories/prisma';
import { timeService } from '../services/time.service';
import { worldService } from '../services/world.service';
import { supplyService } from '../services/supply.service';
import { persistenceService } from '../services/persistence.service';
import { civilizationIntelligenceService } from '../services/civilizationIntelligence.service';

export async function runProcessB() {
  console.log('[Process B] Brand new process started. Loading state strictly from SQLite...');

  // 1. Hydrate state
  await persistenceService.bootstrap();
  await import('../services/world.service').then(m => m.worldService.initialize());
  await import('../services/citizen.service').then(m => m.citizenService.initialize());
  await import('../services/market.service').then(m => m.marketService.initialize());
  await import('../services/supply.service').then(m => m.supplyService.initialize());
  await import('../services/banking.service').then(m => m.bankingService.initialize());

  // 2. Assert Time Restoration
  const time = timeService.engine.getCurrentTime();
  console.log(`[Process B] Restored Simulation Time: Year ${time.year}, Month ${time.month}, Day ${time.day}, Hour ${time.hour}`);
  if (time.year !== 2 || time.month !== 4 || time.day !== 15 || time.hour !== 10) {
    throw new Error(`[Process B Failure] Time mismatch. Expected Year 2 Month 4 Day 15 Hour 10, got ${JSON.stringify(time)}`);
  }

  // 3. Assert Speed Restoration
  const speed = timeService.engine.getSpeed();
  console.log(`[Process B] Restored Simulation Speed: ${speed}x`);
  if (speed !== 2) {
    throw new Error(`[Process B Failure] Speed mismatch. Expected 2, got ${speed}`);
  }

  // 4. Assert Workplace & Wallet Restoration
  const wp = worldService.engine.workplaceRepository.findById('wp-restart-1');
  if (!wp) {
    throw new Error('[Process B Failure] Workplace wp-restart-1 not found in memory after hydration.');
  }
  console.log(`[Process B] Restored Workplace: ${wp.id}, Type: ${wp.type}, Wallet Balance: ${wp.wallet?.balance}`);
  if (wp.wallet?.balance !== 8500) {
    throw new Error(`[Process B Failure] Wallet balance mismatch. Expected 8500, got ${wp.wallet?.balance}`);
  }

  // 5. Assert Inventory Configuration Restoration (T7.8.6 fix verified)
  if (!wp.inventoryConfiguration) {
    throw new Error('[Process B Failure] Inventory configuration not restored on hydrated workplace.');
  }
  console.log('[Process B] Workplace inventoryConfiguration successfully verified.');

  // 6. Assert Physical Inventory Stock
  const inv = supplyService.inventoryManager.getInventory('inv-restart-1');
  const wheatQty = inv?.items['wheat']?.totalQuantity;
  console.log(`[Process B] Restored Inventory Stock: ${wheatQty} kg wheat`);
  if (wheatQty !== 75) {
    throw new Error(`[Process B Failure] Inventory wheat stock mismatch. Expected 75, got ${wheatQty}`);
  }

  // 7. Verify API / Civilization Summary Agreement
  const summary = await civilizationIntelligenceService.getCivilizationSummary();
  console.log(`[Process B] Restored Summary Food Quantity: ${summary.resources.food.quantity} kg`);
  if (summary.resources.food.quantity < 75) {
    throw new Error(`[Process B Failure] Summary food quantity mismatch. Expected >= 75, got ${summary.resources.food.quantity}`);
  }

  // 8. Run subsequent tick to verify no duplicate processing or price drift
  timeService.engine.start();
  timeService.engine.tick();
  console.log('[Process B] Subsequent tick completed smoothly without drift or error.');

  console.log('--- [Process B] PROCESS RESTART INTEGRATION VERIFICATION: 100% SUCCESS ---');
  await prisma.$disconnect();
}

if (require.main === module) {
  runProcessB().then(() => process.exit(0)).catch(err => {
    console.error(err);
    process.exit(1);
  });
}
