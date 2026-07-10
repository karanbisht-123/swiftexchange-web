import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  capitalizeFirst,
  computeClosedPnl,
  copyToClipboard,
  formatTimeAgo,
  formatTimeAgoCompact,
  getDisplayOrderType,
  isMarketOrderType,
} from '../orderUtils';

describe('orderUtils', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-09T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('getDisplayOrderType & isMarketOrderType', () => {
    it('identifies market orders from clientMetadata and type', () => {
      const order1 = { clientMetadata: '1', type: 'LIMIT' };
      expect(getDisplayOrderType(order1)).toBe('MARKET');
      expect(isMarketOrderType(order1)).toBe(true);

      const order2 = { clientMetadata: 1, type: 'LIMIT' };
      expect(getDisplayOrderType(order2)).toBe('MARKET');

      const order3 = { clientMetadata: '0', type: 'LIMIT' };
      expect(getDisplayOrderType(order3)).toBe('LIMIT');
      expect(isMarketOrderType(order3)).toBe(false);

      expect(getDisplayOrderType(null as any)).toBe('—');
    });
  });

  describe('computeClosedPnl', () => {
    it('returns null if parameters are missing', () => {
      expect(computeClosedPnl({ price: '100', size: '10', side: 'BUY' })).toBeNull();
    });

    it('computes closed PnL for LONG positions correctly', () => {
      const fill = {
        positionSideBefore: 'LONG',
        positionSizeBefore: '5',
        entryPriceBefore: '100',
        price: '120',
        size: '3',
        side: 'SELL',
      };
      const res = computeClosedPnl(fill);
      expect(res).toEqual({
        text: '$60.00',
        className: 'text-green-400',
      });
    });

    it('computes closed PnL for SHORT positions correctly', () => {
      const fill = {
        positionSideBefore: 'SHORT',
        positionSizeBefore: '5',
        entryPriceBefore: '100',
        price: '110',
        size: '3',
        side: 'BUY',
      };
      const res = computeClosedPnl(fill);
      expect(res).toEqual({
        text: '-$30.00',
        className: 'text-red-400',
      });
    });

    it('returns null if PnL is null or side matches incorrectly', () => {
      const fill = {
        positionSideBefore: 'LONG',
        positionSizeBefore: '5',
        entryPriceBefore: '100',
        price: '110',
        size: '3',
        side: 'BUY',
      };
      expect(computeClosedPnl(fill)).toBeNull();
    });
  });

  describe('copyToClipboard', () => {
    it('uses navigator.clipboard if available', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      vi.stubGlobal('navigator', {
        clipboard: { writeText },
      });
      vi.stubGlobal('window', {
        isSecureContext: true,
      });

      const res = await copyToClipboard('test_text');
      expect(res).toBe(true);
      expect(writeText).toHaveBeenCalledWith('test_text');
    });

    it('falls back to document.execCommand if clipboard throws or is not available', async () => {
      vi.stubGlobal('navigator', {});
      const appendChild = vi.fn();
      const removeChild = vi.fn();
      const execCommand = vi.fn().mockReturnValue(true);

      vi.stubGlobal('document', {
        createElement: () => ({
          style: {},
          focus: () => {},
          select: () => {},
        }),
        body: {
          appendChild,
          removeChild,
        },
        execCommand,
      });

      const res = await copyToClipboard('test_text');
      expect(res).toBe(true);
      expect(execCommand).toHaveBeenCalledWith('copy');
    });
  });

  describe('formatTimeAgo', () => {
    it('returns fallback for falsy or invalid dates', () => {
      expect(formatTimeAgo('')).toBe('—');
      expect(formatTimeAgo('invalid')).toBe('—');
    });

    it('formats relative times correctly', () => {
      const now = Date.now();
      expect(formatTimeAgo(now - 10000)).toBe('Just now');
      expect(formatTimeAgo(now - 120000)).toBe('2m ago');
      expect(formatTimeAgo(now - 7200000)).toBe('2h ago');
      expect(formatTimeAgo(now - 172800000)).toBe('2d ago');
      expect(formatTimeAgo(now - 1209600000)).toBe('2w ago');
    });
  });

  describe('formatTimeAgoCompact', () => {
    it('returns empty string for invalid dates', () => {
      expect(formatTimeAgoCompact('')).toBe('');
      expect(formatTimeAgoCompact('invalid')).toBe('');
    });

    it('formats compact relative times correctly', () => {
      const now = Date.now();
      expect(formatTimeAgoCompact(now - 10000)).toBe('10s');
      expect(formatTimeAgoCompact(now - 120000)).toBe('2m');
      expect(formatTimeAgoCompact(now - 7200000)).toBe('2h');
      expect(formatTimeAgoCompact(now - 172800000)).toBe('2d');
      expect(formatTimeAgoCompact(now - 1209600000)).toBe('2w');
    });
  });

  describe('capitalizeFirst', () => {
    it('returns default fallback for empty inputs', () => {
      expect(capitalizeFirst(null)).toBe('—');
      expect(capitalizeFirst('')).toBe('—');
    });

    it('capitalizes first letter only', () => {
      expect(capitalizeFirst('hello')).toBe('Hello');
      expect(capitalizeFirst('WORLD')).toBe('World');
    });
  });
});
