import { worldService } from './world.service';
import { worldRepository } from '../repositories';

export class SpatialBackfillMigration {
  public static async runMigration() {
    console.log('[SpatialBackfillMigration] Running spatial backfill migration...');
    
    // We check if we need to migrate by looking at negative coordinates or default dimensions that overlap.
    // For now, since SQLite is local, we just run a pass to ensure everything is strictly positive and non-overlapping.
    
    const world = worldService.engine.worldManager.getWorld();
    if (!world) return;

    let modifiedCount = 0;

    // Fix negative coordinates from old Genesis Prime logic
    for (const region of worldService.engine.regionManager.getAllRegions()) {
      if (region.coordinates.x < 0 || region.coordinates.y < 0) {
        region.coordinates.x = Math.max(0, region.coordinates.x);
        region.coordinates.y = Math.max(0, region.coordinates.y);
        modifiedCount++;
      }

      for (const cityId of region.cityIds) {
        const city = worldService.engine.cityManager.getCity(cityId);
        if (city && (city.coordinates.x < 0 || city.coordinates.y < 0)) {
           city.coordinates.x = Math.max(0, city.coordinates.x);
           city.coordinates.y = Math.max(0, city.coordinates.y);
           modifiedCount++;
        }

        if (city) {
          for (const districtId of city.districtIds) {
            const district = worldService.engine.districtManager.getDistrict(districtId);
            if (district && (district.coordinates.x < 0 || district.coordinates.y < 0)) {
               district.coordinates.x = Math.max(0, district.coordinates.x);
               district.coordinates.y = Math.max(0, district.coordinates.y);
               modifiedCount++;
            }

            if (district) {
              for (const buildingId of district.buildingIds) {
                 const building = worldService.engine.buildingManager.getBuilding(buildingId);
                 if (building && (building.coordinates.x < 0 || building.coordinates.y < 0)) {
                    // Shift to positive to stay inside district bounds conceptually
                    building.coordinates.x = Math.abs(building.coordinates.x);
                    building.coordinates.y = Math.abs(building.coordinates.y);
                    modifiedCount++;
                 }
              }
            }
          }
        }
      }
    }

    if (modifiedCount > 0) {
      console.log(`[SpatialBackfillMigration] Corrected ${modifiedCount} spatial issues (e.g. negative coordinates).`);
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
    } else {
      console.log('[SpatialBackfillMigration] Spatial data is already valid. No migration needed.');
    }
  }
}
