export interface ConsumptionRecord {
  id?: string;
  eventId: string;
  timestamp: number;
  simulationDay?: number;
  simulationHour?: number;
  consumerId?: string;
  householdId?: string;
  sourceInventoryId?: string;
  commodityId: string;
  quantity: number;
  unit: string;
  context: 'CITIZEN_NEED' | 'HOUSEHOLD_CONSUMPTION' | 'CITIZEN_PURCHASE' | string;
  worldId?: string;
  regionId?: string;
  createdAt?: Date;
}

export interface ForecastOptions {
  observationWindowDays?: number;
  forecastHorizonDays?: number;
  minObservations?: number;
  minObservationDays?: number;
}

export type ForecastStatus = 'SUFFICIENT' | 'INSUFFICIENT_HISTORY' | 'NO_DATA';

export interface ForecastResult {
  commodityId: string;
  regionId?: string;
  unit: string;
  observationWindowSeconds: number;
  observationWindowDays: number;
  forecastHorizonSeconds: number;
  forecastHorizonDays: number;
  observedConsumptionTotal: number;
  observedEventsCount: number;
  dailyConsumptionRate: number | null;
  forecastDemand: number | null;
  dataSufficiency: boolean;
  status: ForecastStatus;
  explanation: string;
}
