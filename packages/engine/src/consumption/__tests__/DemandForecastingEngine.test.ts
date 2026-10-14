import { ConsumptionLedger } from '../ConsumptionLedger';
import { DemandForecastingEngine } from '../DemandForecastingEngine';

describe('DemandForecastingEngine', () => {
  let ledger: ConsumptionLedger;
  let forecaster: DemandForecastingEngine;

  beforeEach(() => {
    ledger = new ConsumptionLedger();
    forecaster = new DemandForecastingEngine(ledger, (commodityId) => {
      if (commodityId === 'water') return 'L';
      return 'kg';
    });
  });

  it('1. Reports NO_DATA explicitly when no consumption history exists', () => {
    const result = forecaster.forecast('wheat', 'reg-1', 100000);

    expect(result.dataSufficiency).toBe(false);
    expect(result.status).toBe('NO_DATA');
    expect(result.forecastDemand).toBeNull();
    expect(result.dailyConsumptionRate).toBeNull();
    expect(result.observedConsumptionTotal).toBe(0);
    expect(result.unit).toBe('kg');
    expect(result.explanation).toContain('No historical consumption recorded');
  });

  it('2. Reports INSUFFICIENT_HISTORY explicitly when history span is less than minimum required', () => {
    // Only 1 observation recorded 1 hour ago
    const currentTime = 3600; // 1 hour into simulation
    ledger.record({
      eventId: 'evt-early',
      timestamp: 1800,
      commodityId: 'wheat',
      regionId: 'reg-1',
      quantity: 5,
      unit: 'kg',
      context: 'CITIZEN_NEED'
    });

    const result = forecaster.forecast('wheat', 'reg-1', currentTime, {
      minObservationDays: 1
    });

    expect(result.dataSufficiency).toBe(false);
    expect(result.status).toBe('INSUFFICIENT_HISTORY');
    expect(result.forecastDemand).toBeNull();
    expect(result.dailyConsumptionRate).toBeNull();
    expect(result.observedEventsCount).toBe(1);
    expect(result.observedConsumptionTotal).toBe(5);
    expect(result.explanation).toContain('requires at least 1 day(s) of history');
  });

  it('3. Generates transparent, deterministic rolling average forecast with sufficient history', () => {
    // Simulate 7 days of consumption: 10 kg per day for 7 days = 70 kg total
    const daySeconds = 86400;
    const currentSimTime = 7 * daySeconds;

    for (let day = 0; day < 7; day++) {
      ledger.record({
        eventId: `wheat-day-${day}`,
        timestamp: day * daySeconds + 3600,
        commodityId: 'wheat',
        regionId: 'reg-1',
        quantity: 10,
        unit: 'kg',
        context: 'CITIZEN_NEED'
      });
    }

    const result = forecaster.forecast('wheat', 'reg-1', currentSimTime, {
      observationWindowDays: 7,
      forecastHorizonDays: 1,
      minObservationDays: 1
    });

    expect(result.dataSufficiency).toBe(true);
    expect(result.status).toBe('SUFFICIENT');
    expect(result.unit).toBe('kg');
    expect(result.observedConsumptionTotal).toBe(70);
    expect(result.observedEventsCount).toBe(7);
    expect(result.dailyConsumptionRate).toBe(10); // 70 kg / 7 days = 10 kg/day
    expect(result.forecastDemand).toBe(10); // 10 kg/day * 1 day horizon = 10 kg

    // Horizon of 3 days
    const horizon3 = forecaster.forecast('wheat', 'reg-1', currentSimTime, {
      observationWindowDays: 7,
      forecastHorizonDays: 3,
      minObservationDays: 1
    });
    expect(horizon3.forecastDemand).toBe(30); // 10 kg/day * 3 days = 30 kg
  });

  it('4. Prevents cross-region contamination: different regions maintain separate forecasts', () => {
    const daySeconds = 86400;
    const currentSimTime = 3 * daySeconds;

    // Region 1 has 30 kg wheat consumed
    ledger.record({
      eventId: 'r1-e1',
      timestamp: 3600,
      commodityId: 'wheat',
      regionId: 'reg-1',
      quantity: 30,
      unit: 'kg',
      context: 'CITIZEN_NEED'
    });

    // Region 2 has 90 kg wheat consumed
    ledger.record({
      eventId: 'r2-e1',
      timestamp: 3600,
      commodityId: 'wheat',
      regionId: 'reg-2',
      quantity: 90,
      unit: 'kg',
      context: 'CITIZEN_NEED'
    });

    const forecastR1 = forecaster.forecast('wheat', 'reg-1', currentSimTime, {
      observationWindowDays: 3,
      forecastHorizonDays: 1,
      minObservationDays: 1
    });

    const forecastR2 = forecaster.forecast('wheat', 'reg-2', currentSimTime, {
      observationWindowDays: 3,
      forecastHorizonDays: 1,
      minObservationDays: 1
    });

    // Region 3 with no records
    const forecastR3 = forecaster.forecast('wheat', 'reg-3', currentSimTime, {
      observationWindowDays: 3,
      forecastHorizonDays: 1,
      minObservationDays: 1
    });

    expect(forecastR1.observedConsumptionTotal).toBe(30);
    expect(forecastR1.forecastDemand).toBe(10); // 30 / 3 = 10

    expect(forecastR2.observedConsumptionTotal).toBe(90);
    expect(forecastR2.forecastDemand).toBe(30); // 90 / 3 = 30

    expect(forecastR3.dataSufficiency).toBe(false);
    expect(forecastR3.status).toBe('NO_DATA');
  });

  it('5. Prevents cross-commodity contamination and preserves units consistently', () => {
    const daySeconds = 86400;
    const currentSimTime = 2 * daySeconds;

    ledger.record({
      eventId: 'wheat-1',
      timestamp: 3600,
      commodityId: 'wheat',
      regionId: 'reg-1',
      quantity: 14,
      unit: 'kg',
      context: 'CITIZEN_NEED'
    });

    ledger.record({
      eventId: 'water-1',
      timestamp: 3600,
      commodityId: 'water',
      regionId: 'reg-1',
      quantity: 50,
      unit: 'L',
      context: 'CITIZEN_NEED'
    });

    const wheatForecast = forecaster.forecast('wheat', 'reg-1', currentSimTime, {
      observationWindowDays: 2,
      forecastHorizonDays: 1,
      minObservationDays: 1
    });

    const waterForecast = forecaster.forecast('water', 'reg-1', currentSimTime, {
      observationWindowDays: 2,
      forecastHorizonDays: 1,
      minObservationDays: 1
    });

    expect(wheatForecast.unit).toBe('kg');
    expect(wheatForecast.observedConsumptionTotal).toBe(14);
    expect(wheatForecast.forecastDemand).toBe(7);

    expect(waterForecast.unit).toBe('L');
    expect(waterForecast.observedConsumptionTotal).toBe(50);
    expect(waterForecast.forecastDemand).toBe(25);
  });

  it('6. Determinism: identical state and timestamp produce identical forecast', () => {
    const daySeconds = 86400;
    const currentSimTime = 5 * daySeconds;

    ledger.record({
      eventId: 'det-1',
      timestamp: daySeconds,
      commodityId: 'wheat',
      regionId: 'reg-1',
      quantity: 25,
      unit: 'kg',
      context: 'CITIZEN_NEED'
    });

    const run1 = forecaster.forecast('wheat', 'reg-1', currentSimTime, { observationWindowDays: 5, minObservationDays: 1 });
    const run2 = forecaster.forecast('wheat', 'reg-1', currentSimTime, { observationWindowDays: 5, minObservationDays: 1 });

    expect(run1).toEqual(run2);
  });
});
