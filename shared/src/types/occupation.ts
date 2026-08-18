export enum SkillType {
  AGRICULTURE = 'AGRICULTURE',
  CONSTRUCTION = 'CONSTRUCTION',
  MINING = 'MINING',
  FISHING = 'FISHING',
  FORESTRY = 'FORESTRY',
  CRAFTING = 'CRAFTING',
  ENGINEERING = 'ENGINEERING',
  MEDICINE = 'MEDICINE',
  EDUCATION = 'EDUCATION',
  COMMERCE = 'COMMERCE',
  ADMINISTRATION = 'ADMINISTRATION',
  COOKING = 'COOKING',
  GENERAL_LABOR = 'GENERAL_LABOR'
}

export interface Skill {
  type: SkillType;
  level: number; // 0 to 100
  experience: number;
}

export enum EmploymentStatus {
  STUDENT = 'STUDENT',
  EMPLOYED = 'EMPLOYED',
  UNEMPLOYED = 'UNEMPLOYED',
  RETIRED = 'RETIRED'
}

export enum JobType {
  FARMER = 'FARMER',
  FISHERMAN = 'FISHERMAN',
  MINER = 'MINER',
  FORESTER = 'FORESTER',
  CRAFTSMAN = 'CRAFTSMAN',
  FACTORY_WORKER = 'FACTORY_WORKER',
  SHOPKEEPER = 'SHOPKEEPER',
  SALESPERSON = 'SALESPERSON',
  WHOLESALER = 'WHOLESALER',
  OFFICE_WORKER = 'OFFICE_WORKER',
  BUSINESS_OWNER = 'BUSINESS_OWNER',
  ENGINEER = 'ENGINEER',
  ACCOUNTANT = 'ACCOUNTANT',
  DOCTOR = 'DOCTOR',
  NURSE = 'NURSE',
  TEACHER = 'TEACHER',
  POLICE_OFFICER = 'POLICE_OFFICER',
  FIREFIGHTER = 'FIREFIGHTER',
  LABORER = 'LABORER'
}

export interface WorkSchedule {
  startTime: number; // e.g., 8 means 08:00
  endTime: number;   // e.g., 16 means 16:00
}

export enum WorkplaceType {
  FARM = 'FARM',
  FISHING_SITE = 'FISHING_SITE',
  MINE = 'MINE',
  FOREST_SITE = 'FOREST_SITE',
  OFFICE = 'OFFICE',
  SHOP = 'SHOP',
  FACTORY = 'FACTORY',
  HOSPITAL = 'HOSPITAL',
  SCHOOL = 'SCHOOL',
  FIRE_STATION = 'FIRE_STATION',
  POLICE_STATION = 'POLICE_STATION',
  BUSINESS = 'BUSINESS'
}

export interface JobPosition {
  id: string;
  workplaceId: string;
  type: JobType;
  requiredSkills: Partial<Record<SkillType, number>>;
  occupantId: string | null;
  schedule: WorkSchedule;
}

export interface Workplace {
  id: string;
  type: WorkplaceType;
  locationId: string;
  regionId: string;
  capacity: number;
  occupiedPositions: number;
  vacancies: number;
  positions: JobPosition[];
  metadata?: Record<string, unknown>;
}
