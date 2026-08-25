import { describe, expect, it } from 'vitest';

import {
  formatMarketPrice,
  formatNumeric,
  formatNumericWithCommas,
  formatPriceByTickSize,
} from '../BigNumberUtils';

describe('formatNumeric', () => {
  it('should return default fallback when value is empty or nil', () => {
    expect(formatNumeric(null)).toBe('—');
    expect(formatNumeric(undefined)).toBe('—');
    expect(formatNumeric('')).toBe('—');
  });

  it('should return default fallback when value is NaN', () => {
    expect(formatNumeric('invalid_number')).toBe('—');
  });

  it('should format numbers with specified decimal places', () => {
    expect(formatNumeric(123.456, 2)).toBe('123.46');
    expect(formatNumeric(123.456, 1)).toBe('123.5');
    expect(formatNumeric(123.456, 0)).toBe('123');
  });

  it('should apply prefix and suffix correctly', () => {
    expect(formatNumeric(100, 2, '$', ' USD')).toBe('$100.00 USD');
  });

  it('should round half up', () => {
    expect(formatNumeric(1.25, 1)).toBe('1.3');
    expect(formatNumeric(1.24, 1)).toBe('1.2');
  });
});

describe('formatNumericWithCommas', () => {
  it('should return fallback for invalid inputs', () => {
    expect(formatNumericWithCommas(null)).toBe('—');
    expect(formatNumericWithCommas('NaN')).toBe('—');
  });

  it('should format large numbers with commas', () => {
    expect(formatNumericWithCommas(1234567.89, 2)).toBe('1,234,567.89');
  });

  it('should apply prefix and suffix', () => {
    expect(formatNumericWithCommas(1000, 0, '$', '!')).toBe('$1,000!');
  });
});

describe('formatPriceByTickSize', () => {
  it('should return fallback for invalid inputs', () => {
    expect(formatPriceByTickSize(null, '0.01')).toBe('—');
  });

  it('should determine decimal places from tickSize', () => {
    expect(formatPriceByTickSize(12.3456, '0.01')).toBe('$12.35');
    expect(formatPriceByTickSize(12.3456, '0.001')).toBe('$12.346');
    expect(formatPriceByTickSize(12.3456, 1)).toBe('$12');
  });

  it('should fall back to 2 decimals if tickSize is missing or invalid', () => {
    expect(formatPriceByTickSize(12.3456, null)).toBe('$12.35');
    expect(formatPriceByTickSize(12.3456, 'invalid')).toBe('$12.35');
  });

  it('should accept custom prefix', () => {
    expect(formatPriceByTickSize(12.3456, '0.1', '€')).toBe('€12.3');
  });
});

describe('formatMarketPrice', () => {
  it('should return fallback for invalid values', () => {
    expect(formatMarketPrice(null)).toBe('—');
    expect(formatMarketPrice('invalid')).toBe('—');
  });

  it('should format large values >= 10000 with 0 decimals', () => {
    expect(formatMarketPrice(12345.67)).toBe('12,346');
  });

  it('should format values >= 1000 with 1 decimal', () => {
    expect(formatMarketPrice(1234.56)).toBe('1,234.6');
  });

  it('should format values >= 1 with 4 decimals', () => {
    expect(formatMarketPrice(123.456789)).toBe('123.4568');
  });

  it('should format values >= 0.0001 with 8 decimals', () => {
    expect(formatMarketPrice(0.123456789)).toBe('0.12345679');
  });

  it('should format tiny values with 20 decimals and use subscripts for leading zeros', () => {
    expect(formatMarketPrice(0.0000123)).toBe('0.0₄123');
    expect(formatMarketPrice(0.000000005678)).toBe('0.0₈5678');
  });

  it('should format values below 0.0001 with standard formatting if leading zeros < 4', () => {
    expect(formatMarketPrice(0.00123)).toBe('0.00123');
  });

  it('should respect custom prefix', () => {
    expect(formatMarketPrice(1.2345, '$')).toBe('$1.2345');
  });
});
