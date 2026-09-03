import { prisma } from './src/repositories/prisma';

async function wipe() {
  console.log("Wiping DB...");
  await prisma.inventoryItem.deleteMany();
  await prisma.inventory.deleteMany();
  await prisma.citizen.deleteMany();
  await prisma.jobPosition.deleteMany();
  await prisma.workplace.deleteMany();
  await prisma.region.deleteMany();
  await prisma.world.deleteMany();
  await prisma.wallet.deleteMany();
  await prisma.simulationEvent.deleteMany();
  console.log("Wiped.");
}

wipe().catch(console.error);
