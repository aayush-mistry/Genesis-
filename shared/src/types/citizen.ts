import { SimulationTime } from './time';

export enum CitizenStatus {
  ACTIVE = 'ACTIVE',
  DECEASED = 'DECEASED'
}

export enum CitizenGender {
  MALE = 'MALE',
  FEMALE = 'FEMALE',
  OTHER = 'OTHER'
}

export interface Citizen {
  id: string;
  name: string;
  birthDate: SimulationTime;
  gender: CitizenGender;
  status: CitizenStatus;
  createdAt: SimulationTime;
  locationId: string | null;
}
