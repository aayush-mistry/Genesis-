import { execSync } from 'child_process';
import { prisma } from '../repositories/prisma';
import path from 'path';

async function main() {
  console.log('--- Starting Genuine Process A -> Process B Process Restart Test ---');

  // Script for Process A
  const processAScript = `
    const { prisma } = require('./src/repositories/prisma');
    const { timeService } = require('./src/services/time.service');
    const { worldService } = require('./src/services/world.service');
    const { supplyService } = require('./src/services/supply.service');
    const { citizenService } = require('./src/services/citizen.service');
    const { persistenceService } = require('./src/services/persistence.service');

    async function runA() {
      // Setup initial world in Process A
      timeService.engine.reset();
      supplyService.initialize();

      const time = { year: 2, month: 4, day: 15, hour: 10, minute: 30, second: 0 };
      timeService.engine.setCurrentTime(time);
      timeService.engine.setSpeed(2);

      // Create a test world
      await prisma.simulationState.upsert({
        where: { id: 'singleton' },
        update: { year: 2, month: 4, day: 15, hour: 10, minute: 30, second: 0, speed: 2, activeWorldId: 'world-restart-test' },
        create: { id: 'singleton', year: 2, month: 4, day: 15, hour: 10, minute: 30, second: 0, speed: 2, activeWorldId: 'world-restart-test' }
      });

      await prisma.world.upsert({
        where: { id: 'world-restart-test' },
        update: { name: 'Restart Test World', status: 'ACTIVE' },
        create: {
          id: 'world-restart-test',
          name: 'Restart Test World',
          description: 'Process restart verification',
          randomSeed: 99,
          creationTime: 1000,
          worldSize: 1000,
          climateProfile: 'TEMPERATE',
          timeZone: 'UTC',
          version: '1.0',
          status: 'ACTIVE'
        }
      });

      // Workplace & Inventory
      const wpId = 'wp-restart-1';
      const invId = 'inv-restart-1';
      await prisma.wallet.upsert({
        where: { ownerId: wpId },
        update: { balance: 8500, currency: 'INR' },
        create: { id: 'w-restart-wp-1', ownerId: wpId, balance: 8500, currency: 'INR' }
      });

      await prisma.inventory.upsert({
        where: { id: invId },
        update: { storageCapacity: 2000 },
        create: { id: invId, ownerId: wpId, storageCapacity: 2000 }
      });

      await prisma.inventoryItem.upsert({
        where: { inventoryId_productId: { inventoryId: invId, productId: 'wheat' } },
        update: { totalQuantity: 75, availableQuantity: 75 },
        create: { inventoryId: invId, productId: 'wheat', totalQuantity: 75, availableQuantity: 75, unit: 'kg' }
      });

      await prisma.workplace.upsert({
        where: { id: wpId },
        update: { capacity: 10, occupiedPositions: 3, vacancies: 7, inventoryId: invId, storageCapacity: 2000 },
        create: {
          id: wpId,
          type: 'SHOP',
          locationId: 'loc-1',
          capacity: 10,
          occupiedPositions: 3,
          vacancies: 7,
          inventoryId: invId,
          storageCapacity: 2000,
          walletId: 'w-restart-wp-1'
        }
      });

      console.log('Process A state persisted successfully.');
      await prisma.$disconnect();
      process.exit(0);
    }
    runA().catch(err => { console.error('Process A Error:', err); process.exit(1); });
  `;

  // Script for Process B
  const processBScript = `
    const { prisma } = require('./src/repositories/prisma');
    const { timeService } = require('./src/services/time.service');
    const { worldService } = require('./src/services/world.service');
    const { supplyService } = require('./src/services/supply.service');
    const { persistenceService } = require('./src/services/persistence.service');
    const { civilizationIntelligenceService } = require('./src/services/civilizationIntelligence.service');

    async function runB() {
      console.log('Process B: Initializing fresh process and bootstrapping from DB...');
      
      // Bootstrap from database
      await persistenceService.bootstrap();
      supplyService.initialize();

      // Verify hydrated Time
      const time = timeService.engine.getCurrentTime();
      if (time.year !== 2 || time.month !== 4 || time.day !== 15 || time.hour !== 10) {
        throw new Error(\`Process B: Time mismatch. Expected Year 2 Month 4 Day 15 Hour 10, got \${JSON.stringify(time)}\`);
      }

      // Verify hydrated Workplace & Inventory
      const wp = worldService.engine.workplaceRepository.findById('wp-restart-1');
      if (!wp) {
        throw new Error('Process B: Workplace wp-restart-1 was not hydrated into WorldEngine.');
      }
      if (wp.wallet?.balance !== 8500) {
        throw new Error(\`Process B: Workplace wallet balance mismatch. Expected 8500, got \${wp.wallet?.balance}\`);
      }
      if (!wp.inventoryConfiguration) {
        throw new Error('Process B: Workplace inventoryConfiguration was not restored.');
      }

      const inv = supplyService.inventoryManager.getInventory('inv-restart-1');
      if (!inv || inv.items['wheat']?.totalQuantity !== 75) {
        throw new Error(\`Process B: Inventory mismatch. Expected 75 wheat, got \${inv?.items['wheat']?.totalQuantity}\`);
      }

      // Verify Civilization Summary API agreement
      const summary = await civilizationIntelligenceService.getCivilizationSummary();
      if (summary.resources.food.quantity < 75) {
        throw new Error(\`Process B: Summary food quantity mismatch. Expected >= 75, got \${summary.resources.food.quantity}\`);
      }

      console.log('Process B: All hydration, state, and invariant assertions PASSED perfectly.');
      await prisma.$disconnect();
      process.exit(0);
    }
    runB().catch(err => { console.error('Process B Error:', err); process.exit(1); });
  `;

  // Execute Process A
  console.log('Executing Process A via node child process...');
  const backendDir = path.resolve(__dirname, '../../');
  execSync(`node -e "${processAScript.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`, {
    cwd: backendDir,
    stdio: 'inherit'
  });

  // Execute Process B
  console.log('Executing Process B via completely new node child process against same SQLite DB...');
  execSync(`node -e "${processBScript.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`, {
    cwd: backendDir,
    stdio: 'inherit'
  });

  console.log('--- Process A -> Process B Process Restart Test PASSED ---');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
