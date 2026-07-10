import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { formatTime, getTimeAgo } from '../timeUtils';

describe('timeUtils', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-09T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('getTimeAgo', () => {
    it('should format minutes ago correctly', () => {
      const fiveMinutesAgo = new Date('2026-07-09T11:55:00Z').toISOString();
      expect(getTimeAgo(fiveMinutesAgo)).toBe('5m');
    });

    it('should format hours ago correctly', () => {
      const threeHoursAgo = new Date('2026-07-09T09:00:00Z').toISOString();
      expect(getTimeAgo(threeHoursAgo)).toBe('3h');
    });

    it('should format days ago correctly', () => {
      const twoDaysAgo = new Date('2026-07-07T12:00:00Z').toISOString();
      expect(getTimeAgo(twoDaysAgo)).toBe('2d');
    });

    it('should format weeks ago correctly', () => {
      const threeWeeksAgo = new Date('2026-06-18T12:00:00Z').toISOString();
      expect(getTimeAgo(threeWeeksAgo)).toBe('3w');
    });
  });

  describe('formatTime', () => {
    it('should format timestamp to local time string in 24h format', () => {
      const isoString = '2026-07-09T14:30:15Z';

      const expected = new Date(isoString).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      });
      expect(formatTime(isoString)).toBe(expected);
    });
  });
});
