import { District } from '@genesis/shared';
import { randomUUID } from 'crypto';

export class DistrictManager {
  private districts: Map<string, District> = new Map();

  public createDistrict(districtData: Omit<District, 'id' | 'buildingIds'>): District {
    const district: District = {
      ...districtData,
      id: randomUUID(),
      createdAt: new Date(),
      updatedAt: new Date(),
      buildingIds: [],
    };
    this.districts.set(district.id, district);
    return district;
  }

  public getDistrict(id: string): District | undefined {
    return this.districts.get(id);
  }

  public getAllDistricts(): District[] {
    return Array.from(this.districts.values());
  }

  public updateDistrict(id: string, updates: Partial<Omit<District, 'id'>>): District | undefined {
    const district = this.districts.get(id);
    if (!district) return undefined;

    const updatedDistrict = { ...district, ...updates };
    this.districts.set(id, updatedDistrict);
    return updatedDistrict;
  }

  public deleteDistrict(id: string): boolean {
    return this.districts.delete(id);
  }

  public addBuilding(districtId: string, buildingId: string): void {
    const district = this.districts.get(districtId);
    if (district && !district.buildingIds.includes(buildingId)) {
      district.buildingIds.push(buildingId);
    }
  }

  public removeBuilding(districtId: string, buildingId: string): void {
    const district = this.districts.get(districtId);
    if (district) {
      district.buildingIds = district.buildingIds.filter((id: string) => id !== buildingId);
    }
  }
}
