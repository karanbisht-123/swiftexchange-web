import { beforeEach, describe, expect, it } from 'vitest';

import { useDateRangeStore } from '../dateRangeStore';

describe('dateRangeStore', () => {
  beforeEach(() => {
    useDateRangeStore.setState({
      fromDate: null,
      toDate: null,
    });
  });

  it('sets fromDate and toDate correctly', () => {
    const store = useDateRangeStore.getState();
    store.setFromDate('2026-07-01');
    expect(useDateRangeStore.getState().fromDate).toBe('2026-07-01');

    store.setToDate('2026-07-05');
    expect(useDateRangeStore.getState().toDate).toBe('2026-07-05');
  });

  it('sets range and clears range correctly', () => {
    const store = useDateRangeStore.getState();
    store.setRange('2026-07-01', '2026-07-05');
    expect(useDateRangeStore.getState().fromDate).toBe('2026-07-01');
    expect(useDateRangeStore.getState().toDate).toBe('2026-07-05');

    store.clearRange();
    expect(useDateRangeStore.getState().fromDate).toBeNull();
    expect(useDateRangeStore.getState().toDate).toBeNull();
  });

  it('returns isActive state correctly depending on date inputs', () => {
    const store = useDateRangeStore.getState();
    expect(store.isActive()).toBe(false);

    store.setFromDate('2026-07-01');
    expect(useDateRangeStore.getState().isActive()).toBe(true);

    store.clearRange();
    store.setToDate('2026-07-05');
    expect(useDateRangeStore.getState().isActive()).toBe(true);
  });
});
