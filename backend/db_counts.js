const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
    console.log('World:', await prisma.world.count());
    console.log('Region:', await prisma.region.count());
    console.log('City:', await prisma.city.count());
    console.log('District:', await prisma.district.count());
    console.log('Building:', await prisma.building.count());
    console.log('Workplace:', await prisma.workplace.count());
    console.log('Household:', await prisma.household.count());
    console.log('Citizen:', await prisma.citizen.count());
    console.log('Resource:', await prisma.resource.count());
}
main().then(() => prisma.$disconnect());
