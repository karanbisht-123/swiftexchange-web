import { describe, expect, it } from 'vitest';

import {
  calculateCrossLiquidationPrice,
  calculateCurrentMargin,
  calculateInitialMarginRequired,
  calculateIsolatedLiquidationPrice,
  calculateMaintenanceMarginRequired,
  calculateMaxOrderSize,
  calculateOrderMarginImpact,
  formatCurrency,
  formatPercent,
  getLiquidationRiskLevel,
  getMarginUsageColors,
  getMinimumRequiredMargin,
  getTransferableAmount,
} from '../marginCalculator';

describe('marginCalculator', () => {
  describe('calculateCurrentMargin', () => {
    it('returns zeroes for null balance', () => {
      expect(calculateCurrentMargin(null)).toEqual({
        portfolioValue: 0,
        availableBalance: 0,
        marginUsed: 0,
        marginUsagePercent: 0,
        totalMarginRequired: 0,
      });
    });

    it('calculates current margin correctly', () => {
      const balance = {
        totalEquity: '1000',
        crossEquity: '1000',
        freeCollateral: '800',
      };
      const res = calculateCurrentMargin(balance);
      expect(res.portfolioValue).toBe(1000);
      expect(res.availableBalance).toBe(800);
      expect(res.marginUsed).toBe(200);
      expect(res.marginUsagePercent).toBe(20);
    });
  });

  describe('calculateInitialMarginRequired & calculateMaintenanceMarginRequired', () => {
    it('calculates margins correctly', () => {
      expect(calculateInitialMarginRequired(2, 3000, 0.05)).toBe(300);
      expect(calculateMaintenanceMarginRequired(2, 3000, 0.03)).toBe(180);
    });
  });

  describe('calculateOrderMarginImpact', () => {
    it('calculates impact correctly', () => {
      const res = calculateOrderMarginImpact(1000, 800, 2, 3000, 10, 0.05);
      expect(res.initialMarginRequired).toBe(300);
      expect(res.maintenanceMarginRequired).toBe(180); // 300 * 0.6 = 180
      expect(res.newAvailableBalance).toBe(500); // 800 - 300 = 500
      expect(res.newMarginUsed).toBe(500); // 1000 - 500 = 500
      expect(res.newMarginUsage).toBe(50);
      expect(res.canAfford).toBe(true);
    });
  });

  describe('calculateIsolatedLiquidationPrice', () => {
    it('calculates liquidation price correctly', () => {
      const buyPrice = calculateIsolatedLiquidationPrice(1, 3000, 150, 0.03, 'BUY');
      expect(buyPrice).toBeCloseTo(2938.14, 2);

      const sellPrice = calculateIsolatedLiquidationPrice(1, 3000, 150, 0.03, 'SELL');
      expect(sellPrice).toBeCloseTo(3058.25, 2);
    });
  });

  describe('calculateCrossLiquidationPrice', () => {
    it('calculates cross liquidation price correctly', () => {
      const price = calculateCrossLiquidationPrice(1, 3000, 1000, 0.03, 100, 'BUY');
      expect(price).toBeCloseTo(2164.95, 2);
    });
  });

  describe('calculateMaxOrderSize', () => {
    it('returns zero for invalid price', () => {
      expect(calculateMaxOrderSize(100, 0)).toBe(0);
    });

    it('calculates max order size correctly', () => {
      expect(calculateMaxOrderSize(100, 50, 10)).toBe(20);
    });
  });

  describe('getLiquidationRiskLevel', () => {
    it('returns correct risk levels', () => {
      expect(getLiquidationRiskLevel(10)).toBe('low');
      expect(getLiquidationRiskLevel(60)).toBe('medium');
      expect(getLiquidationRiskLevel(80)).toBe('high');
      expect(getLiquidationRiskLevel(90)).toBe('critical');
    });
  });

  describe('getMarginUsageColors', () => {
    it('returns correct colors', () => {
      expect(getMarginUsageColors(90).text).toBe('text-red-500');
      expect(getMarginUsageColors(75).text).toBe('text-orange-500');
      expect(getMarginUsageColors(60).text).toBe('text-yellow-500');
      expect(getMarginUsageColors(10).text).toBe('text-green-500');
    });
  });

  describe('formatCurrency & formatPercent', () => {
    it('formats values correctly', () => {
      expect(formatCurrency(1234.567, 2)).toBe('1,234.57');
      expect(formatPercent(12.345, 1)).toBe('12.3');
    });
  });

  describe('getMinimumRequiredMargin & getTransferableAmount', () => {
    it('calculates correctly', () => {
      expect(getMinimumRequiredMargin(6000, 0.03, 1.1)).toBeCloseTo(198, 5);
      expect(getTransferableAmount(1000, 200)).toBe(800);
      expect(getTransferableAmount(100, 200)).toBe(0);
    });
  });
});
