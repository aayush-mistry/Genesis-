import { City } from '@genesis/shared';
import { randomUUID } from 'crypto';

export class CityManager {
  private cities: Map<string, City> = new Map();

  public createCity(cityData: Omit<City, 'id' | 'districtIds' | 'districtCount' | 'buildingCount'>): City {
    const city: City = {
      ...cityData,
      id: randomUUID(),
      createdAt: new Date(),
      updatedAt: new Date(),
      districtIds: [],
      districtCount: 0,
      buildingCount: 0,
    };
    this.cities.set(city.id, city);
    return city;
  }

  public getCity(id: string): City | undefined {
    return this.cities.get(id);
  }

  public getAllCities(): City[] {
    return Array.from(this.cities.values());
  }

  public updateCity(id: string, updates: Partial<Omit<City, 'id'>>): City | undefined {
    const city = this.cities.get(id);
    if (!city) return undefined;

    const updatedCity = { ...city, ...updates };
    this.cities.set(id, updatedCity);
    return updatedCity;
  }

  public deleteCity(id: string): boolean {
    return this.cities.delete(id);
  }

  public addDistrict(cityId: string, districtId: string): void {
    const city = this.cities.get(cityId);
    if (city && !city.districtIds.includes(districtId)) {
      city.districtIds.push(districtId);
      city.districtCount = city.districtIds.length;
    }
  }

  public removeDistrict(cityId: string, districtId: string): void {
    const city = this.cities.get(cityId);
    if (city) {
      city.districtIds = city.districtIds.filter((id: string) => id !== districtId);
      city.districtCount = city.districtIds.length;
    }
  }
}
