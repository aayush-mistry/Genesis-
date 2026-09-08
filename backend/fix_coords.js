const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function fix() {
  await prisma.city.updateMany({ data: { area: 250000 } });
  await prisma.district.updateMany({ data: { coordX: -100, coordY: -100, area: 10000 } });
  await prisma.building.updateMany({ where: { type: 'FACTORY' }, data: { coordX: -120, coordY: -120 } });
  await prisma.building.updateMany({ where: { type: 'STORE' }, data: { coordX: -80, coordY: -80 } });
  console.log('Fixed DB coords!');
}
fix().then(()=>prisma.$disconnect());
