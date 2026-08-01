import { BaseEntity } from './common';

export interface Coordinate {
  x: number;
  y: number;
}

export enum DistrictType {
  RESIDENTIAL = 'RESIDENTIAL',
  COMMERCIAL = 'COMMERCIAL',
  INDUSTRIAL = 'INDUSTRIAL',
  AGRICULTURAL = 'AGRICULTURAL',
  EDUCATIONAL = 'EDUCATIONAL',
  HEALTHCARE = 'HEALTHCARE',
}

export enum BuildingType {
  HOUSE = 'HOUSE',
  APARTMENT = 'APARTMENT',
  SCHOOL = 'SCHOOL',
  HOSPITAL = 'HOSPITAL',
  POLICE_STATION = 'POLICE_STATION',
  RESTAURANT = 'RESTAURANT',
  FACTORY = 'FACTORY',
  OFFICE = 'OFFICE',
  BANK = 'BANK',
  STORE = 'STORE',
}

export interface WorldEntity extends BaseEntity {
  name: string;
  metadata?: Record<string, any>;
}

export interface World extends WorldEntity {
  description: string;
  randomSeed: number;
  creationTime: number;
  currentPopulation: number;
  worldSize: number;
  climateProfile: string;
  timeZone: string;
  version: string;
  status: string;
  regionIds: string[];
}

export interface Region extends WorldEntity {
  description: string;
  climate: string;
  population: number;
  coordinates: Coordinate;
  worldId: string;
  cityIds: string[];
}

export interface City extends WorldEntity {
  population: number;
  coordinates: Coordinate;
  area: number;
  regionId: string;
  districtIds: string[];
  districtCount: number;
  buildingCount: number;
}

export interface District extends WorldEntity {
  type: DistrictType;
  cityId: string;
  buildingIds: string[];
}

export interface Building extends WorldEntity {
  type: BuildingType;
  coordinates: Coordinate;
  capacity: number;
  owner?: string;
  status: string;
  districtId: string;
  roomIds: string[];
}

export interface Room extends WorldEntity {
  type: string;
  buildingId: string;
  objectIds: string[];
}

export interface WorldObject extends WorldEntity {
  type: string;
  roomId?: string;
  coordinates?: Coordinate;
}
