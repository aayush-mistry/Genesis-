import { worldService } from './src/services/world.service';
import { persistenceService } from './src/services/persistence.service';
import { timeService } from './src/services/time.service';

async function main() {
  try {
    await persistenceService.bootstrap();
    await worldService.initialize();
    console.log("Initialization successful.");
  } catch (err) {
    console.error("Initialization failed:", err);
  }
}
main().then(() => process.exit(0));
