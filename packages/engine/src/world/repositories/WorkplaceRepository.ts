import { Workplace } from '@genesis/shared';

export class WorkplaceRepository {
  private workplaces: Map<string, Workplace> = new Map();

  public create(workplace: Workplace): void {
    if (this.workplaces.has(workplace.id)) {
      throw new Error(`Workplace with ID ${workplace.id} already exists.`);
    }
    this.workplaces.set(workplace.id, workplace);
  }

  public findById(id: string): Workplace | undefined {
    return this.workplaces.get(id);
  }

  public findAll(): Workplace[] {
    return Array.from(this.workplaces.values());
  }

  public update(workplace: Workplace): void {
    if (!this.workplaces.has(workplace.id)) {
      throw new Error(`Workplace with ID ${workplace.id} does not exist.`);
    }
    this.workplaces.set(workplace.id, workplace);
  }

  public delete(id: string): boolean {
    return this.workplaces.delete(id);
  }

  public clear(): void {
    this.workplaces.clear();
  }
}
