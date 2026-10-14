import { ConsumptionLedger } from '../ConsumptionLedger';
import { ConsumptionRecord } from '../ConsumptionTypes';

describe('ConsumptionLedger', () => {
  let ledger: ConsumptionLedger;

  beforeEach(() => {
    ledger = new ConsumptionLedger();
  });

  it('1. Successfully records a valid consumption event', () => {
    const record: ConsumptionRecord = {
      eventId: 'evt-1',
      timestamp: 1000,
      commodityId: 'wheat',
      quantity: 5,
      unit: 'kg',
      context: 'CITIZEN_NEED',
      consumerId: 'cit-1',
      householdId: 'hh-1',
      regionId: 'reg-1'
    };

    const recorded = ledger.record(record);
    expect(recorded).toBe(true);
    expect(ledger.count()).toBe(1);

    const records = ledger.getRecords();
    expect(records.length).toBe(1);
    expect(records[0].commodityId).toBe('wheat');
    expect(records[0].quantity).toBe(5);
  });

  it('2. Enforces idempotency: retrying the same eventId is rejected', () => {
    const record: ConsumptionRecord = {
      eventId: 'evt-duplicate',
      timestamp: 1000,
      commodityId: 'water',
      quantity: 10,
      unit: 'L',
      context: 'CITIZEN_NEED',
      consumerId: 'cit-1',
      regionId: 'reg-1'
    };

    const first = ledger.record(record);
    expect(first).toBe(true);

    const duplicate = ledger.record({
      ...record,
      quantity: 20 // Attempting to alter quantity with same eventId
    });
    expect(duplicate).toBe(false);
    expect(ledger.count()).toBe(1);
    expect(ledger.getRecords()[0].quantity).toBe(10);
  });

  it('3. Rejects invalid or non-positive consumption quantities', () => {
    const zeroRecord: ConsumptionRecord = {
      eventId: 'evt-zero',
      timestamp: 1000,
      commodityId: 'wheat',
      quantity: 0,
      unit: 'kg',
      context: 'CITIZEN_NEED'
    };
    expect(ledger.record(zeroRecord)).toBe(false);

    const negativeRecord: ConsumptionRecord = {
      eventId: 'evt-neg',
      timestamp: 1000,
      commodityId: 'wheat',
      quantity: -5,
      unit: 'kg',
      context: 'CITIZEN_NEED'
    };
    expect(ledger.record(negativeRecord)).toBe(false);
    expect(ledger.count()).toBe(0);
  });

  it('4. Filters records accurately by commodity, region, and time window without contamination', () => {
    ledger.record({
      eventId: 'e1',
      timestamp: 1000,
      commodityId: 'wheat',
      regionId: 'reg-A',
      quantity: 10,
      unit: 'kg',
      context: 'CITIZEN_NEED'
    });
    ledger.record({
      eventId: 'e2',
      timestamp: 2000,
      commodityId: 'wheat',
      regionId: 'reg-B',
      quantity: 15,
      unit: 'kg',
      context: 'CITIZEN_NEED'
    });
    ledger.record({
      eventId: 'e3',
      timestamp: 3000,
      commodityId: 'water',
      regionId: 'reg-A',
      quantity: 20,
      unit: 'L',
      context: 'CITIZEN_NEED'
    });

    const regAWheat = ledger.getRecords({ commodityId: 'wheat', regionId: 'reg-A' });
    expect(regAWheat.length).toBe(1);
    expect(regAWheat[0].quantity).toBe(10);

    const regBWheat = ledger.getRecords({ commodityId: 'wheat', regionId: 'reg-B' });
    expect(regBWheat.length).toBe(1);
    expect(regBWheat[0].quantity).toBe(15);

    const timeFiltered = ledger.getRecords({ fromTimestamp: 1500, toTimestamp: 2500 });
    expect(timeFiltered.length).toBe(1);
    expect(timeFiltered[0].eventId).toBe('e2');
  });

  it('5. Notifies subscribers on new consumption records', () => {
    const notifications: ConsumptionRecord[] = [];
    const unsubscribe = ledger.onRecord(r => notifications.push(r));

    ledger.record({
      eventId: 'e-notify',
      timestamp: 500,
      commodityId: 'wheat',
      quantity: 3,
      unit: 'kg',
      context: 'CITIZEN_NEED'
    });

    expect(notifications.length).toBe(1);
    expect(notifications[0].eventId).toBe('e-notify');

    unsubscribe();
    ledger.record({
      eventId: 'e-no-notify',
      timestamp: 600,
      commodityId: 'wheat',
      quantity: 4,
      unit: 'kg',
      context: 'CITIZEN_NEED'
    });
    expect(notifications.length).toBe(1);
  });
});
