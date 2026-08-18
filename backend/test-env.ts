import { worldService } from './src/services/world.service';
import { environmentService } from './src/services/environment.service';

async function test() {
  await worldService.initialize();
  environmentService.initialize();

  const regions = worldService.engine.regionManager.getAllRegions();
  console.log('Regions count:', regions.length);

  for (const r of regions) {
    console.log('Testing region', r.id);
    try {
      const state = environmentService.engine.getEnvironmentalState(r.id);
      console.log('State:', state);
    } catch (e) {
      console.error('Error in getEnvironmentalState:', e);
    }
  }
}

test().catch(console.error);
