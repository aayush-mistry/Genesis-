import { World } from '@genesis/shared';
import { randomUUID } from 'crypto';

export class WorldManager {
  private world: World | null = null;

  public createWorld(name: string, description: string, seed: number = Date.now()): World {
    this.world = {
      id: randomUUID(),
      name,
      description,
      randomSeed: seed,
      creationTime: Date.now(),
      currentPopulation: 0,
      worldSize: 10000,
      climateProfile: 'Temperate',
      timeZone: 'UTC',
      version: '1.0.0',
      status: 'Active',
      regionIds: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };
    return this.world;
  }

  public loadWorld(world: World): void {
    this.world = world;
  }

  public getWorld(): World | null {
    return this.world;
  }

  public resetWorld(): void {
    this.world = null;
  }

  public addRegion(regionId: string): void {
    if (this.world && !this.world.regionIds.includes(regionId)) {
      this.world.regionIds.push(regionId);
    }
  }

  public removeRegion(regionId: string): void {
    if (this.world) {
      this.world.regionIds = this.world.regionIds.filter((id: string) => id !== regionId);
    }
  }
}
