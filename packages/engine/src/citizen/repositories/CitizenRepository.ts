import { Citizen } from '@genesis/shared';

export interface CitizenRepository {
  create(citizen: Citizen): void;
  findById(id: string): Citizen | undefined;
  findAll(): Citizen[];
  update(citizen: Citizen): void;
  delete(id: string): boolean;
  clear(): void;
}
