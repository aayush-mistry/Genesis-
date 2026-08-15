import { Citizen } from '@genesis/shared';
import { CitizenRepository } from './CitizenRepository';

export class InMemoryCitizenRepository implements CitizenRepository {
  private citizens: Map<string, Citizen> = new Map();

  public create(citizen: Citizen): void {
    if (this.citizens.has(citizen.id)) {
      throw new Error(`Citizen with ID ${citizen.id} already exists`);
    }
    this.citizens.set(citizen.id, citizen);
  }

  public findById(id: string): Citizen | undefined {
    return this.citizens.get(id);
  }

  public findAll(): Citizen[] {
    return Array.from(this.citizens.values());
  }

  public update(citizen: Citizen): void {
    if (!this.citizens.has(citizen.id)) {
      throw new Error(`Citizen with ID ${citizen.id} does not exist`);
    }
    this.citizens.set(citizen.id, citizen);
  }

  public delete(id: string): boolean {
    return this.citizens.delete(id);
  }

  public clear(): void {
    this.citizens.clear();
  }
}
