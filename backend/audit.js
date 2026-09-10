const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const models = [
    'world', 'region', 'city', 'district', 'building', 'workplace',
    'household', 'citizen', 'resource', 'inventory', 'order',
    'shipment', 'bank', 'bankAccount', 'loan'
  ];
  for (const m of models) {
    if (prisma[m]) {
      const count = await prisma[m].count();
      console.log(`${m}: ${count}`);
    } else {
      console.log(`${m}: MODEL NOT FOUND`);
    }
  }

  // Also let's query some real entities
  console.log("\n=== REAL FACTORIES ===");
  const factories = await prisma.building.findMany({
    where: { type: 'FACTORY' },
    take: 3,
    include: { district: true }
  });
  console.log(JSON.stringify(factories, null, 2));

  console.log("\n=== REAL GENERAL STORES ===");
  const stores = await prisma.building.findMany({
    where: { type: 'GENERAL_STORE' },
    take: 3,
    include: { district: true }
  });
  console.log(JSON.stringify(stores, null, 2));

  console.log("\n=== REAL DISTRICTS ===");
  const districts = await prisma.district.findMany({
    take: 3
  });
  console.log(JSON.stringify(districts, null, 2));

  console.log("\n=== REAL HOUSEHOLDS ===");
  const households = await prisma.household.findMany({
    take: 3
  });
  console.log(JSON.stringify(households, null, 2));

  console.log("\n=== REAL CITIZENS ===");
  const citizens = await prisma.citizen.findMany({
    take: 3
  });
  console.log(JSON.stringify(citizens, null, 2));

}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
