const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
    const worlds = await prisma.world.findMany();
    console.log(worlds);
}
main().then(() => prisma.$disconnect());
