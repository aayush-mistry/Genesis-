import { worldService } from './world.service';
import { worldRepository, citizenRepository } from '../repositories';
import { SettlementGenerator } from '@genesis/engine';

export class SpatialBackfillMigration {
  public static async runMigration() {
    console.log('[SpatialBackfillMigration] Running spatial backfill migration...');
    
    const world = worldService.engine.worldManager.getWorld();
    if (!world) return;

    let modifiedSpatialCount = 0;

    // 1. Fix negative coordinates from old Genesis Prime logic
    for (const region of worldService.engine.regionManager.getAllRegions()) {
      if (region.coordinates.x < 0 || region.coordinates.y < 0) {
        region.coordinates.x = Math.max(0, region.coordinates.x);
        region.coordinates.y = Math.max(0, region.coordinates.y);
        modifiedSpatialCount++;
      }

      for (const cityId of region.cityIds) {
        const city = worldService.engine.cityManager.getCity(cityId);
        if (city && (city.coordinates.x < 0 || city.coordinates.y < 0)) {
           city.coordinates.x = Math.max(0, city.coordinates.x);
           city.coordinates.y = Math.max(0, city.coordinates.y);
           modifiedSpatialCount++;
        }

        if (city) {
          for (const districtId of city.districtIds) {
            const district = worldService.engine.districtManager.getDistrict(districtId);
            if (district && (district.coordinates.x < 0 || district.coordinates.y < 0)) {
               district.coordinates.x = Math.max(0, district.coordinates.x);
               district.coordinates.y = Math.max(0, district.coordinates.y);
               modifiedSpatialCount++;
            }

            if (district) {
              for (const buildingId of district.buildingIds) {
                 const building = worldService.engine.buildingManager.getBuilding(buildingId);
                 if (building && (building.coordinates.x < 0 || building.coordinates.y < 0)) {
                    // Shift to positive to stay inside district bounds conceptually
                    building.coordinates.x = Math.abs(building.coordinates.x);
                    building.coordinates.y = Math.abs(building.coordinates.y);
                    modifiedSpatialCount++;
                 }
              }
            }
          }
        }
      }
    }

    if (modifiedSpatialCount > 0) {
      console.log(`[SpatialBackfillMigration] Corrected ${modifiedSpatialCount} spatial issues (e.g. negative coordinates).`);
      // Update DB
      for (const region of worldService.engine.regionManager.getAllRegions()) {
         await worldRepository.updateRegion(region.id, { coordX: region.coordinates.x, coordY: region.coordinates.y });
         for (const cityId of region.cityIds) {
           const city = worldService.engine.cityManager.getCity(cityId);
           if (city) await worldRepository.updateCity(city.id, { coordX: city.coordinates.x, coordY: city.coordinates.y });
         }
      }
      for (const district of worldService.engine.districtManager.getAllDistricts()) {
         await worldRepository.updateDistrict(district.id, { coordX: district.coordinates.x, coordY: district.coordinates.y });
      }
      for (const building of worldService.engine.buildingManager.getAllBuildings()) {
         await worldRepository.updateBuilding(building.id, { coordX: building.coordinates.x, coordY: building.coordinates.y });
      }
    }

    // 2. Citizen Settlement Backfill
    const { citizenService } = await import('./citizen.service');
    const allCitizens = citizenService.engine.listCitizens();
    
    const unspatializedCitizens = allCitizens.filter(
      (c: any) => !c.householdId || !c.locationId || c.coordX == null || c.coordY == null
    );

    if (unspatializedCitizens.length === 0) {
      console.log('[SpatialBackfillMigration] All citizens are spatialized. No migration needed.');
      return;
    }

    console.log(`[SpatialBackfillMigration] Found ${unspatializedCitizens.length} unspatialized citizens. Generating settlement...`);

    // Get the first city
    const allCities = worldService.engine.cityManager.getAllCities();
    if (allCities.length === 0) {
       console.warn('[SpatialBackfillMigration] Cannot spatialize citizens without a city.');
       return;
    }
    const city = allCities[0];

    const generator = new SettlementGenerator(worldService.engine);
    
    const residentialDistrict = generator.getOrCreateResidentialDistrict(city.id, world.randomSeed.toString());
    
    // Calculate required apartments just for the unspatialized ones (assuming existing ones are accommodated)
    const newApartments = generator.generateApartmentsForPopulation(
      residentialDistrict, 
      unspatializedCitizens.length, 
      world.randomSeed.toString()
    );

    // Save the district and new apartments if they were created
    if (newApartments.length > 0 || residentialDistrict.updatedAt.getTime() === residentialDistrict.createdAt.getTime()) {
      // Just save the district safely
      const d = residentialDistrict;
      await worldRepository.createDistrict({
        id: d.id,
        cityId: d.cityId,
        name: d.name,
        type: d.type,
        area: d.area,
        coordX: d.coordinates.x,
        coordY: d.coordinates.y,
        width: d.width,
        height: d.height,
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
      }).catch(e => {}); // Ignore duplicate
      
      for (const b of newApartments) {
        await worldRepository.createBuilding({
          id: b.id,
          districtId: b.districtId,
          name: b.name,
          type: b.type,
          capacity: b.capacity,
          status: b.status,
          coordX: b.coordinates.x,
          coordY: b.coordinates.y,
          width: b.width,
          height: b.height,
          createdAt: b.createdAt,
          updatedAt: b.updatedAt,
        }).catch(e => {});
      }
    }

    // Now get all apartment complexes in the district to distribute unspatialized citizens
    const allApartments = residentialDistrict.buildingIds
      .map(id => worldService.engine.buildingManager.getBuilding(id))
      .filter(b => b && b.type === 'APARTMENT') as any[];

    const result = generator.assignCitizensToHouseholds(
      allApartments, 
      unspatializedCitizens, 
      citizenService.engine.householdService,
      world.randomSeed.toString()
    );

    // Persist new households
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();
    const householdData = result.households.map(h => ({
      id: h.id,
      locationId: h.locationId,
      inventoryId: h.inventoryId,
      walletId: h.walletId
    }));
    for (let i = 0; i < householdData.length; i += 50) {
      await prisma.household.createMany({ data: householdData.slice(i, i + 50) }).catch(e => {});
    }

    // Update the citizens in DB
    const cData = result.assignedCitizens.map(c => ({
      id: c.id,
      locationId: c.locationId,
      householdId: c.householdId,
      coordX: c.coordX,
      coordY: c.coordY
    }));
    for (const c of cData) {
      await prisma.citizen.update({
        where: { id: c.id },
        data: {
          locationId: c.locationId,
          householdId: c.householdId,
          coordX: c.coordX,
          coordY: c.coordY
        }
      });
    }

    await prisma.$disconnect();

    console.log(`[SpatialBackfillMigration] Spatialization complete. Assigned ${cData.length} citizens.`);
  }
}
