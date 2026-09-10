import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

const prisma = new PrismaClient();

async function backfill() {
  console.log('Starting spatial backfill...');

  const citizens = await prisma.citizen.findMany();
  if (citizens.length === 0) {
    console.log('No citizens found. Exiting.');
    return;
  }
  
  const district = await prisma.district.findFirst({ where: { type: 'COMMERCIAL' } }) || 
                   await prisma.district.findFirst();

  if (!district) {
    console.log('No district found to place homes.');
    return;
  }

  // Load existing buildings to check collisions
  const existingBuildings = await prisma.building.findMany({ where: { districtId: district.id } });
  
  const isColliding = (x: number, y: number, w: number, h: number) => {
    for (const b of existingBuildings) {
      if (x < b.coordX + b.width &&
          x + w > b.coordX &&
          y < b.coordY + b.height &&
          y + h > b.coordY) {
        return true;
      }
    }
    return false;
  };

  // We have 5000 citizens. We will create APARTMENTs of capacity 100. Need 50.
  const numApartments = 50;
  const buildingWidth = 30;
  const buildingHeight = 30;
  
  const createdBuildings: any[] = [];
  
  let currentX = district.coordX - district.width / 2;
  let currentY = district.coordY - district.width / 2;
  
  console.log('Creating buildings and households...');
  
  for (let i = 0; i < numApartments; i++) {
    // Find empty spot
    let placed = false;
    let attempts = 0;
    while (!placed && attempts < 1000) {
      const rx = district.coordX - district.width / 2 + Math.random() * (district.width - buildingWidth);
      const ry = district.coordY - district.height / 2 + Math.random() * (district.height - buildingHeight);
      
      if (!isColliding(rx, ry, buildingWidth, buildingHeight)) {
        // Place here
        const buildingId = uuidv4();
        const b = {
          id: buildingId,
          name: `Apartment Block ${i+1}`,
          type: 'APARTMENT',
          coordX: Math.floor(rx),
          coordY: Math.floor(ry),
          width: buildingWidth,
          height: buildingHeight,
          capacity: 100,
          status: 'ACTIVE',
          districtId: district.id,
        };
        existingBuildings.push(b as any);
        createdBuildings.push(b);
        placed = true;
      }
      attempts++;
    }
  }

  console.log(`Placed ${createdBuildings.length} apartments.`);

  // Insert buildings into DB
  for (const b of createdBuildings) {
    await prisma.building.create({ data: b });
  }

  // Create households for each apartment
  const households = [];
  for (const b of createdBuildings) {
    // For an apartment of 100, we could have 25 households of 4, or just 1 big household per apartment for simplicity, 
    // or 1 household per citizen. Let's create 1 household per apartment for now, 
    // or let's create 10 households per apartment.
    // The user said "implement the minimum domain-level household generation required". 
    // It's probably easier to just do 1 household = 1 building if it's a HOUSE, or multiple if APARTMENT.
    // Let's just create 1 household per building to keep it simple.
    
    const householdId = uuidv4();
    const inventoryId = uuidv4();
    const walletId = uuidv4();
    
    // Create inventory and wallet first
    await prisma.inventory.create({
      data: { id: inventoryId, ownerId: householdId, storageCapacity: 1000 }
    });
    await prisma.wallet.create({
      data: { id: walletId, ownerId: householdId, balance: 1000, currency: 'CREDIT' }
    });
    
    const h = await prisma.household.create({
      data: {
        id: householdId,
        locationId: b.id,
        inventoryId: inventoryId,
        walletId: walletId
      }
    });
    
    households.push({ ...h, coordX: b.coordX, coordY: b.coordY });
  }

  console.log(`Created ${households.length} households.`);

  // Assign citizens to households
  console.log('Assigning citizens to households and updating their coordinates...');
  
  let citizenUpdates = [];
  for (let i = 0; i < citizens.length; i++) {
    const c = citizens[i];
    const h = households[i % households.length];
    
    // Exact position inside the building bounds
    const cx = h.coordX + Math.random() * buildingWidth;
    const cy = h.coordY + Math.random() * buildingHeight;
    
    citizenUpdates.push(
      prisma.citizen.update({
        where: { id: c.id },
        data: {
          householdId: h.id,
          locationId: h.locationId,
          coordX: cx,
          coordY: cy
        }
      })
    );
    
    // Batch updates to avoid overwhelming the DB connection
    if (citizenUpdates.length === 500) {
      await prisma.$transaction(citizenUpdates);
      citizenUpdates = [];
      console.log(`Updated ${i + 1} citizens...`);
    }
  }
  
  if (citizenUpdates.length > 0) {
    await prisma.$transaction(citizenUpdates);
  }
  
  // Also let's assign them to workplaces so they have jobs
  const workplaces = await prisma.workplace.findMany();
  if (workplaces.length > 0) {
    console.log(`Found ${workplaces.length} workplaces. Assigning citizens to jobs...`);
    let wpUpdates = [];
    for (let i = 0; i < citizens.length; i++) {
      const w = workplaces[i % workplaces.length];
      wpUpdates.push(
        prisma.citizen.update({
          where: { id: citizens[i].id },
          data: {
            workplaceId: w.id,
            employmentStatus: 'EMPLOYED'
          }
        })
      );
      if (wpUpdates.length === 500) {
        await prisma.$transaction(wpUpdates);
        wpUpdates = [];
      }
    }
    if (wpUpdates.length > 0) {
      await prisma.$transaction(wpUpdates);
    }
  }

  console.log('Backfill complete!');
}

backfill()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
