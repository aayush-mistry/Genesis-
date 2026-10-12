import { prisma } from '../repositories/prisma';
import { timeService } from '../services/time.service';
import { worldService } from '../services/world.service';
import { supplyService } from '../services/supply.service';
import { persistenceService } from '../services/persistence.service';

export async function runProcessA() {
  console.log('[Process A] Initializing baseline world and state...');
  timeService.engine.reset();
  supplyService.initialize();

  const time = { year: 2, month: 4, day: 15, hour: 10, minute: 30, second: 0 };
  timeService.engine.setCurrentTime(time);
  timeService.engine.setSpeed(2);

  // Create persistent simulation state and world
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

  await prisma.region.upsert({
    where: { id: 'reg-restart-1' },
    update: { name: 'Restart Test Region' },
    create: {
      id: 'reg-restart-1',
      name: 'Restart Test Region',
      description: 'Restart region',
      climate: 'TEMPERATE',
      coordX: 0,
      coordY: 0,
      worldId: 'world-restart-test'
    }
  });

  await prisma.workplace.upsert({
    where: { id: wpId },
    update: { capacity: 10, occupiedPositions: 3, vacancies: 7, inventoryId: invId, storageCapacity: 2000 },
    create: {
      id: wpId,
      type: 'SHOP',
      locationId: 'reg-restart-1',
      regionId: 'reg-restart-1',
      capacity: 10,
      occupiedPositions: 3,
      vacancies: 7,
      inventoryId: invId,
      storageCapacity: 2000,
      walletId: 'w-restart-wp-1'
    }
  });

  console.log('[Process A] State successfully committed to SQLite. Graceful process exit.');
  await prisma.$disconnect();
}

if (require.main === module) {
  runProcessA().then(() => process.exit(0)).catch(err => {
    console.error(err);
    process.exit(1);
  });
}
