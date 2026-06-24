// @ts-nocheck
import { toPlainString, formatAmount, getGasBuffer } from '../swapAmountUtils';

describe('swapAmountUtils', () => {
  describe('toPlainString', () => {
    it('should convert standard number to string', () => {
      expect(toPlainString(123.45)).toBe('123.45');
    });

    it('should convert scientific notation to plain string representation', () => {
      expect(toPlainString(1e-7)).toBe('0.0000001');
    });

    it('should return 0 on invalid values', () => {
      expect(toPlainString(null)).toBe('0');
      expect(toPlainString(undefined)).toBe('0');
      expect(toPlainString(NaN)).toBe('0');
    });
  });

  describe('formatAmount', () => {
    it('should parse human amount to token units based on decimals', () => {
      // 1.5 with 6 decimals = 1500000
      expect(formatAmount('1.5', 6)).toBe('1500000');
    });

    it('should truncate extra decimals to prevent overflow', () => {
      expect(formatAmount('1.5555555', 2)).toBe('155');
    });

    it('should return 0 on empty input', () => {
      expect(formatAmount('', 18)).toBe('0');
    });
  });

  describe('getGasBuffer', () => {
    it('should return correct gas buffer for BNB Chain (chainId 56)', () => {
      const buffer = getGasBuffer(56, 18);
      // BNB Chain gas buffer is 0.0005 BNB
      expect(buffer.toString()).toBe('500000000000000');
    });

    it('should return correct gas buffer for Polygon (chainId 137)', () => {
      const buffer = getGasBuffer(137, 18);
      // Polygon gas buffer is 0.1 POL
      expect(buffer.toString()).toBe('100000000000000000');
    });
  });
});
