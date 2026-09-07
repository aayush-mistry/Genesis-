const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
    const state = await prisma.simulationState.findFirst();
    console.log(state);
}
main().then(() => prisma.$disconnect());
