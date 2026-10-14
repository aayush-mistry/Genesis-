import { ConsumptionLedger } from './ConsumptionLedger';
import { ForecastOptions, ForecastResult, ForecastStatus } from './ConsumptionTypes';

export class DemandForecastingEngine {
  constructor(
    private consumptionLedger: ConsumptionLedger,
    private unitLookup?: (commodityId: string) => string | undefined
  ) {}

  /**
   * Generates a transparent, deterministic rolling-average demand forecast
   * from actual historical consumption recorded in the ledger.
   *
   * @param commodityId The commodity identifier (e.g. 'wheat', 'water')
   * @param regionId Optional region identifier to prevent cross-region contamination
   * @param currentTimeSeconds Current simulation timestamp in seconds
   * @param options Configurable observation window and forecast horizon
   */
  public forecast(
    commodityId: string,
    regionId?: string,
    currentTimeSeconds: number = 0,
    options?: ForecastOptions
  ): ForecastResult {
    const observationWindowDays = options?.observationWindowDays ?? 7;
    const forecastHorizonDays = options?.forecastHorizonDays ?? 1;
    const minObservations = options?.minObservations ?? 1;
    const minObservationDays = options?.minObservationDays ?? 1;

    const observationWindowSeconds = observationWindowDays * 86400;
    const forecastHorizonSeconds = forecastHorizonDays * 86400;
    const windowStartSeconds = Math.max(0, currentTimeSeconds - observationWindowSeconds);

    // Query actual consumption events strictly within the observation window
    const records = this.consumptionLedger.getRecords({
      commodityId,
      regionId,
      fromTimestamp: windowStartSeconds,
      toTimestamp: currentTimeSeconds
    });

    // Exclude invalid or non-positive quantities
    const validRecords = records.filter(r => r.quantity > 0);
    const observedEventsCount = validRecords.length;
    const observedConsumptionTotal = validRecords.reduce((sum, r) => sum + r.quantity, 0);

    // Determine consistent unit
    let unit = 'units';
    if (validRecords.length > 0 && validRecords[0].unit) {
      unit = validRecords[0].unit;
    } else if (this.unitLookup) {
      unit = this.unitLookup(commodityId) || 'units';
    }

    // 1. Case: Zero observed history
    if (observedEventsCount === 0) {
      return {
        commodityId,
        regionId,
        unit,
        observationWindowSeconds,
        observationWindowDays,
        forecastHorizonSeconds,
        forecastHorizonDays,
        observedConsumptionTotal: 0,
        observedEventsCount: 0,
        dailyConsumptionRate: null,
        forecastDemand: null,
        dataSufficiency: false,
        status: 'NO_DATA',
        explanation: `No historical consumption recorded for ${commodityId}${regionId ? ` in region ${regionId}` : ''} in the past ${observationWindowDays} simulation day(s).`
      };
    }

    // 2. Case: Insufficient observation span (e.g. less than minObservationDays or minObservations)
    // Note: If currentTime is less than the required minimum observation days, history is insufficient
    const earliestTimestamp = Math.min(...validRecords.map(r => r.timestamp));
    const historySpanSeconds = currentTimeSeconds - earliestTimestamp;
    const requiredSpanSeconds = minObservationDays * 86400;

    if (observedEventsCount < minObservations || historySpanSeconds < requiredSpanSeconds) {
      return {
        commodityId,
        regionId,
        unit,
        observationWindowSeconds,
        observationWindowDays,
        forecastHorizonSeconds,
        forecastHorizonDays,
        observedConsumptionTotal,
        observedEventsCount,
        dailyConsumptionRate: null,
        forecastDemand: null,
        dataSufficiency: false,
        status: 'INSUFFICIENT_HISTORY',
        explanation: `Insufficient history for ${commodityId}: observed ${observedEventsCount} event(s) across ${(historySpanSeconds / 86400).toFixed(2)} day(s), but requires at least ${minObservationDays} day(s) of history.`
      };
    }

    // 3. Case: Sufficient data -> Deterministic rolling average
    // Average daily consumption rate = total observed in window / window duration in days
    const dailyConsumptionRate = observedConsumptionTotal / observationWindowDays;
    const forecastDemand = Number((dailyConsumptionRate * forecastHorizonDays).toFixed(4));

    return {
      commodityId,
      regionId,
      unit,
      observationWindowSeconds,
      observationWindowDays,
      forecastHorizonSeconds,
      forecastHorizonDays,
      observedConsumptionTotal: Number(observedConsumptionTotal.toFixed(4)),
      observedEventsCount,
      dailyConsumptionRate: Number(dailyConsumptionRate.toFixed(4)),
      forecastDemand,
      dataSufficiency: true,
      status: 'SUFFICIENT',
      explanation: `Forecast demand of ${forecastDemand} ${unit} over next ${forecastHorizonDays} day(s) based on ${observedConsumptionTotal.toFixed(2)} ${unit} consumed across ${observedEventsCount} event(s) over ${observationWindowDays} day(s) (${dailyConsumptionRate.toFixed(2)} ${unit}/day).`
    };
  }
}
