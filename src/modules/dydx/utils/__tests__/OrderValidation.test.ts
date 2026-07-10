import { describe, expect, it, vi } from 'vitest';

import {
  calculateIsolatedCollateralRequired,
  calculateLiquidationPrice,
  getMaxBuyingPower,
  getPriceDecimals,
  getSafeMaxBuyingPower,
  roundToTickSize,
  validateIsolatedPosition,
  validateOrderPrice,
  validateOrderSize,
  validateTriggerPrice,
} from '../OrderValidation';

vi.mock('../currencyService', () => ({
  currencyService: {
    parseInput: vi.fn((input: string) => {
      const val = parseFloat(input);
      if (isNaN(val) || val <= 0) return { isValid: false };
      return { isValid: true, baseAmount: val, usdAmount: val * 100 };
    }),
    getMinimumUsd: vi.fn(() => 5),
  },
}));

vi.mock('../../types/trading.types', () => ({
  SUBACCOUNT_CONSTANTS: {
    MIN_ISOLATED_EQUITY: 10,
  },
}));

describe('OrderValidation', () => {
  const mockMarketData: any = {
    oraclePrice: '100',
    stepSize: '0.1',
    baseAsset: 'ETH',
    initialMarginFraction: 0.05,
  };

  describe('validateOrderSize', () => {
    it('returns error if marketData is missing', () => {
      expect(validateOrderSize(null, '1.0', 'BASE')).toEqual({
        isValid: false,
        error: 'Market data not available',
      });
    });

    it('returns error if input is invalid', () => {
      expect(validateOrderSize(mockMarketData, '-5', 'BASE')).toEqual({
        isValid: false,
        error: 'Please enter a valid order size',
      });
    });

    it('validates minimum isolated margin requirements', () => {
      const result = validateOrderSize(
        mockMarketData,
        '0.1', // baseAmount = 0.1, usdAmount = 10
        'BASE',
        null,
        1,
        'LIMIT',
        'ISOLATED'
      );
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Minimum ISOLATED margin is $20');
    });

    it('validates minimum size limitations', () => {
      const result = validateOrderSize(mockMarketData, '0.05', 'BASE');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Minimum order size is');
    });
  });

  describe('validateAccountBalance', () => {
    it('returns error if equity is below minimum', () => {
      const result = validateOrderSize(mockMarketData, '0.5', 'BASE', {
        totalEquity: '0.5',
        freeCollateral: '0.5',
      });
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Minimum account equity of $1 required');
    });

    it('returns error for conditional orders if equity is below $20', () => {
      const result = validateOrderSize(
        mockMarketData,
        '0.5',
        'BASE',
        { totalEquity: '15', freeCollateral: '15' },
        1,
        'STOP_LIMIT'
      );
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Conditional orders require minimum account equity of $20');
    });

    it('returns error if free collateral is zero or negative', () => {
      const result = validateOrderSize(mockMarketData, '0.5', 'BASE', {
        totalEquity: '50',
        freeCollateral: '0',
      });
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Insufficient free collateral');
    });

    it('warns when using >90% or >80% of available collateral', () => {
      const result90 = validateOrderSize(
        mockMarketData,
        '0.75', // usdAmount = 75, requiredMargin = 3.75
        'BASE',
        { totalEquity: '50', freeCollateral: '4' },
        20
      );
      expect(result90.isValid).toBe(true);
      expect(result90.warning).toContain('uses >90% of available collateral');

      const result80 = validateOrderSize(
        mockMarketData,
        '0.65', // usdAmount = 65, requiredMargin = 3.25
        'BASE',
        { totalEquity: '50', freeCollateral: '4' },
        20
      );
      expect(result80.isValid).toBe(true);
      expect(result80.warning).toContain('Using >80% of free collateral');
    });
  });

  describe('validateOrderPrice', () => {
    it('returns error if price is invalid', () => {
      expect(validateOrderPrice(mockMarketData, '0')).toEqual({
        isValid: false,
        error: 'Please enter a valid price greater than 0',
      });
    });

    it('warns if price deviation is >10%', () => {
      const result = validateOrderPrice(mockMarketData, '120');
      expect(result.isValid).toBe(true);
      expect(result.warning).toContain('away from current market price');
    });
  });

  describe('validateTriggerPrice', () => {
    it('warns for STOP order triggers executing immediately', () => {
      const resultSell = validateTriggerPrice(mockMarketData, '110', 'SELL', 'STOP_MARKET');
      expect(resultSell.warning).toContain('Stop loss trigger is above current price');

      const resultBuy = validateTriggerPrice(mockMarketData, '90', 'BUY', 'STOP_LIMIT');
      expect(resultBuy.warning).toContain('Stop loss trigger is below current price');
    });

    it('warns for TAKE_PROFIT order triggers executing immediately', () => {
      const resultSell = validateTriggerPrice(mockMarketData, '90', 'SELL', 'TAKE_PROFIT_MARKET');
      expect(resultSell.warning).toContain('Take profit trigger is below current price');

      const resultBuy = validateTriggerPrice(mockMarketData, '110', 'BUY', 'TAKE_PROFIT_LIMIT');
      expect(resultBuy.warning).toContain('Take profit trigger is above current price');
    });
  });

  describe('getMaxBuyingPower & getSafeMaxBuyingPower', () => {
    const mockBalance = { freeCollateral: '100' };

    it('returns max buying power based on leverage', () => {
      expect(getMaxBuyingPower(mockBalance, mockMarketData, 5)).toBe(500);
      expect(getSafeMaxBuyingPower(mockBalance, mockMarketData, 5)).toBe(500 / 1.02);
    });

    it('returns 0 if balance/marketData is missing or negative collateral', () => {
      expect(getMaxBuyingPower(null, mockMarketData)).toBe(0);
      expect(getMaxBuyingPower({ freeCollateral: '-10' }, mockMarketData)).toBe(0);
    });
  });

  describe('roundToTickSize', () => {
    it('rounds correctly to nearest tick', () => {
      expect(roundToTickSize(12.3456, 0.01)).toBe(12.35);
      expect(roundToTickSize(12.344, 0.01)).toBe(12.34);
    });
  });

  describe('getPriceDecimals', () => {
    it('derives correct price decimals', () => {
      expect(getPriceDecimals('0.01')).toBe(2);
      expect(getPriceDecimals(0.0001)).toBe(4);
      expect(getPriceDecimals(1)).toBe(0);
    });
  });

  describe('validateIsolatedPosition', () => {
    it('returns valid for non-isolated margin mode', () => {
      expect(validateIsolatedPosition('CROSS', 10).isValid).toBe(true);
    });

    it('validates subaccount equity against isolated minimums', () => {
      const result = validateIsolatedPosition('ISOLATED', 5);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Isolated positions require minimum $10 equity');
    });

    it('validates conditional orders isolated equity', () => {
      const result = validateIsolatedPosition('ISOLATED', 15, 'STOP_LIMIT');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain(
        'Conditional orders require minimum $20 equity in isolated subaccount'
      );
    });
  });

  describe('calculateIsolatedCollateralRequired', () => {
    it('returns max of buffer margin or isolated minimum equity', () => {
      expect(calculateIsolatedCollateralRequired(100, 0.05)).toBe(10); // 100 * 0.05 * 1.02 = 5.1, min 10
      expect(calculateIsolatedCollateralRequired(1000, 0.05)).toBe(51); // 1000 * 0.05 * 1.02 = 51
    });
  });

  describe('calculateLiquidationPrice', () => {
    it('calculates liquidation price correctly', () => {
      const buyPrice = calculateLiquidationPrice(1, 3000, 150, 0.03, 'BUY');
      expect(buyPrice).toBeCloseTo(2938.14, 2);

      const sellPrice = calculateLiquidationPrice(1, 3000, 150, 0.03, 'SELL');
      expect(sellPrice).toBeCloseTo(3058.25, 2);
    });
  });
});
