import { prisma } from './src/repositories/prisma';
import { persistenceService } from './src/services/persistence.service';

async function runRestartTest() {
  console.log('--- BEGIN RESTART TEST ---');
  
  // 1. Seed some fake data simulating a previous run
  console.log('Seeding fake database state...');
  await prisma.simulationState.upsert({
    where: { id: 'singleton' },
    update: { year: 1, month: 2, day: 15, speed: 1 },
    create: { id: 'singleton', year: 1, month: 2, day: 15, speed: 1 }
  });

  await prisma.citizen.upsert({
    where: { id: 'test-citizen-1' },
    update: { name: 'Test Citizen' },
    create: { 
      id: 'test-citizen-1', 
      name: 'Test Citizen', 
      gender: 'MALE', 
      status: 'ALIVE',
      birthDateJson: '{}',
      createdAtSimJson: '{}',
      vitalStateJson: '{}',
      personalityJson: '{}',
      movementState: 'IDLE',
      skillsJson: '{}',
      employmentStatus: 'UNEMPLOYED'
    }
  });

  // 2. Simulate Backend Startup Hydration
  console.log('\nSimulating Backend Restart Hydration Sequence...');
  await persistenceService.bootstrap();
  
  console.log('\n--- END RESTART TEST ---');
}

runRestartTest().catch(console.error).finally(() => prisma.$disconnect());
