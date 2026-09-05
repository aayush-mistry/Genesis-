const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  await prisma.$executeRawUnsafe('UPDATE World SET creationTime = 0 WHERE id = "test-world"');
  console.log('Updated World creationTime');
  
  console.log('Finding building...');
  let building = await prisma.building.findFirst();
  
  if (!building) {
    console.log('No buildings found! Creating a default location hierarchy...');
    
    let world = await prisma.world.findFirst({ where: { id: 'test-world' } });
    if (!world) {
      world = await prisma.world.create({
        data: {
          id: 'test-world',
          name: 'Test World',
          description: 'A test world',
          randomSeed: 12345,
          creationTime: 0,
          worldSize: 1000,
          climateProfile: 
          'Temperate',
          timeZone: 'UTC',
          version: '1.0.0',
          status: 'ACTIVE'
        }
      });
    }

    let region = await prisma.region.findFirst({ where: { id: 'test-region' } });
    if (!region) {
      region = await prisma.region.create({
        data: {
          id: 'test-region',
          name: 'Test Region',
          description: 'Test',
          climate: 'Temperate',
          coordX: 0,
          coordY: 0,
          worldId: world.id
        }
      });
    }

    let city = await prisma.city.findFirst({ where: { id: 'test-city' } });
    if (!city) {
      city = await prisma.city.create({
        data: {
          id: 'test-city',
          name: 'Test City',
          coordX: 0,
          coordY: 0,
          area: 100,
          regionId: region.id
        }
      });
    }

    let district = await prisma.district.findFirst({ where: { id: 'test-district' } });
    if (!district) {
      district = await prisma.district.create({
        data: {
          id: 'test-district',
          name: 'Test District',
          type: 'RESIDENTIAL',
          cityId: city.id
        }
      });
    }

    building = await prisma.building.create({
      data: {
        id: 'test-building',
        name: 'Test House',
        type: 'HOME',
        coordX: 0,
        coordY: 0,
        capacity: 5,
        status: 'ACTIVE',
        districtId: district.id
      }
    });
  }

  console.log('Assigning location to test-citizen-banking:', building.id);
  await prisma.citizen.update({
    where: { id: 'test-citizen-banking' },
    data: { locationId: building.id }
  });
  console.log('Done!');
}

run().catch(console.error).finally(() => prisma.$disconnect());
