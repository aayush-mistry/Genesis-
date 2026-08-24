import { JobType } from '@genesis/shared';

export const JobBaseSalary: Record<JobType, number> = {
  [JobType.FARMER]: 1500,
  [JobType.FISHERMAN]: 1600,
  [JobType.MINER]: 2500,
  [JobType.FORESTER]: 1800,
  [JobType.CRAFTSMAN]: 2200,
  [JobType.FACTORY_WORKER]: 2000,
  [JobType.SHOPKEEPER]: 1800,
  [JobType.SALESPERSON]: 1900,
  [JobType.WHOLESALER]: 2400,
  [JobType.OFFICE_WORKER]: 2600,
  [JobType.BUSINESS_OWNER]: 5000,
  [JobType.ENGINEER]: 4500,
  [JobType.ACCOUNTANT]: 4000,
  [JobType.DOCTOR]: 6000,
  [JobType.NURSE]: 3500,
  [JobType.TEACHER]: 3000,
  [JobType.POLICE_OFFICER]: 3200,
  [JobType.FIREFIGHTER]: 3300,
  [JobType.LABORER]: 1200
};

export const JobRiskMultiplier: Record<JobType, number> = {
  [JobType.FARMER]: 1.1,
  [JobType.FISHERMAN]: 1.2,
  [JobType.MINER]: 1.5,
  [JobType.FORESTER]: 1.3,
  [JobType.CRAFTSMAN]: 1.0,
  [JobType.FACTORY_WORKER]: 1.2,
  [JobType.SHOPKEEPER]: 1.0,
  [JobType.SALESPERSON]: 1.0,
  [JobType.WHOLESALER]: 1.0,
  [JobType.OFFICE_WORKER]: 1.0,
  [JobType.BUSINESS_OWNER]: 1.0,
  [JobType.ENGINEER]: 1.1,
  [JobType.ACCOUNTANT]: 1.0,
  [JobType.DOCTOR]: 1.3,
  [JobType.NURSE]: 1.2,
  [JobType.TEACHER]: 1.0,
  [JobType.POLICE_OFFICER]: 1.6,
  [JobType.FIREFIGHTER]: 1.7,
  [JobType.LABORER]: 1.4
};
