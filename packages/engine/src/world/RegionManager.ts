import { Region } from '@genesis/shared';
import { randomUUID } from 'crypto';

export class RegionManager {
  private regions: Map<string, Region> = new Map();

  public createRegion(regionData: Omit<Region, 'id' | 'cityIds'>): Region {
    const region: Region = {
      ...regionData,
      id: randomUUID(),
      createdAt: new Date(),
      updatedAt: new Date(),
      cityIds: [],
    };
    this.regions.set(region.id, region);
    return region;
  }

  public getRegion(id: string): Region | undefined {
    return this.regions.get(id);
  }

  public getAllRegions(): Region[] {
    return Array.from(this.regions.values());
  }

  public updateRegion(id: string, updates: Partial<Omit<Region, 'id'>>): Region | undefined {
    const region = this.regions.get(id);
    if (!region) return undefined;

    const updatedRegion = { ...region, ...updates };
    this.regions.set(id, updatedRegion);
    return updatedRegion;
  }

  public deleteRegion(id: string): boolean {
    return this.regions.delete(id);
  }

  public addCity(regionId: string, cityId: string): void {
    const region = this.regions.get(regionId);
    if (region && !region.cityIds.includes(cityId)) {
      region.cityIds.push(cityId);
    }
  }

  public removeCity(regionId: string, cityId: string): void {
    const region = this.regions.get(regionId);
    if (region) {
      region.cityIds = region.cityIds.filter((id: string) => id !== cityId);
    }
  }
}
