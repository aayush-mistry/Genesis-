export { type BaseEntity } from './types/common';
import { SystemStatus as _SystemStatus } from './enums/status';
import { GENESIS_CONFIG as _GENESIS_CONFIG } from './constants/config';

export const SystemStatus = _SystemStatus;
export const GENESIS_CONFIG = _GENESIS_CONFIG;

export * from './types/world';
export * from './types/environment';
export * from './types/resources';
export * from './types/time';
export * from './types/citizen';

export { ResourceCategory, ResourceType } from './types/resources';
export * from './types/spatial';
export * from './types/occupation';
export * from './types/decision';
export * from './types/perception';
export * from './types/execution';
export * from './types/routine';
export * from './types/economy';
export * from './types/inventory';
export * from './types/production';
export * from './types/supply';
