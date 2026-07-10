import { describe, expect, it } from 'vitest';

import { currencyService } from '../currencyService';

describe('currencyService', () => {
  const marketData: any = {
    oraclePrice: '100',
    stepSize: '0.1',
    tickSize: '0.01',
    baseAsset: 'ETH',
  };

  describe('convertToBase & convertToUsd', () => {
    it('performs conversions accurately', () => {
      expect(currencyService.convertToBase(50, 100)).toBe(0.5);
      expect(currencyService.convertToBase(50, 0)).toBe(0);
      expect(currencyService.convertToUsd(0.5, 100)).toBe(50);
    });
  });

  describe('roundToStepSize & roundToTickSize', () => {
    it('rounds values accurately', () => {
      expect(currencyService.roundToStepSize(0.55, '0.1')).toBeCloseTo(0.5, 5);
      expect(currencyService.roundToStepSize(0.55, '0')).toBe(0.55);

      expect(currencyService.roundToTickSize(12.3456, '0.01')).toBeCloseTo(12.35, 5);
      expect(currencyService.roundToTickSize(12.3456, '0')).toBe(12.3456);
    });
  });

  describe('parseInput', () => {
    it('returns invalid result for NaN or non-positive values', () => {
      expect(currencyService.parseInput('invalid', 'USD', marketData).isValid).toBe(false);
      expect(currencyService.parseInput('-5', 'USD', marketData).isValid).toBe(false);
    });

    it('parses input correctly for USD mode', () => {
      const res = currencyService.parseInput('50', 'USD', marketData);
      expect(res.isValid).toBe(true);
      expect(res.usdAmount).toBe(50);
      expect(res.baseAmount).toBe(0.5);
    });

    it('parses input correctly for BASE mode', () => {
      const res = currencyService.parseInput('0.5', 'BASE', marketData);
      expect(res.isValid).toBe(true);
      expect(res.usdAmount).toBe(50);
      expect(res.baseAmount).toBe(0.5);
    });
  });

  describe('formatBaseAmount & formatUsdAmount', () => {
    it('formats values accurately', () => {
      expect(currencyService.formatBaseAmount(1.23, 4)).toBe('1.23');
      expect(currencyService.formatUsdAmount(1.2345)).toBe('1.23');
    });
  });

  describe('getStepSizeDecimals', () => {
    it('returns decimal count of stepSize', () => {
      expect(currencyService.getStepSizeDecimals('0.001')).toBe(3);
      expect(currencyService.getStepSizeDecimals('1')).toBe(0);
    });
  });

  describe('getMinimumUsd', () => {
    it('returns stepSize times price', () => {
      expect(currencyService.getMinimumUsd(marketData)).toBe(10);
      expect(currencyService.getMinimumUsd({ ...marketData, stepSize: null })).toBe(0);
    });
  });

  describe('getNearestValidSize', () => {
    it('computes rounded value accurately for USD mode', () => {
      const res = currencyService.getNearestValidSize(55, 'USD', marketData); // 55 USD = 0.55 ETH -> rounded to 0.5 ETH -> 50 USD
      expect(res.baseAmount).toBe(0.5);
      expect(res.usdAmount).toBe(50);
    });

    it('computes rounded value accurately for BASE mode', () => {
      const res = currencyService.getNearestValidSize(0.55, 'BASE', marketData); // 0.55 ETH -> rounded to 0.5 ETH -> 50 USD
      expect(res.baseAmount).toBe(0.5);
      expect(res.usdAmount).toBe(50);
    });
  });
});
