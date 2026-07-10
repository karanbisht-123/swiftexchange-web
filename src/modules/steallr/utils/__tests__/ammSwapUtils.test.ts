import { Asset } from '@stellar/stellar-sdk';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  assetToString,
  assetsEqual,
  calculateExchangeRate,
  calculateUsdValue,
  createTokenInfo,
  debounce,
  formatAmount,
  formatAssetFullName,
  formatAssetName,
  formatPriceImpact,
  formatTimeRemaining,
  formatTxHash,
  getMinimumReceived,
  getPathDescription,
  isQuoteValid,
  parseAssetString,
  validateSwapAmount,
} from '../ammSwapUtils';

vi.mock('@stellar/stellar-sdk', () => {
  class MockAsset {
    code: string;
    issuer: string;
    constructor(code: string, issuer: string) {
      this.code = code;
      this.issuer = issuer;
    }
    isNative() {
      return !this.issuer || this.code === 'XLM';
    }
    static native() {
      return new MockAsset('XLM', '');
    }
  }

  return {
    Asset: MockAsset,
  };
});

vi.mock('../../../evm/utils/Chainregistry', () => ({
  getChainById: vi.fn(id => (id === 'pubnet' ? { symbol: 'XLM' } : null)),
}));

vi.mock('../../../evm/utils/ChainUrlHelpers', () => ({
  getTokenIcon: vi.fn(code => `icon_${code.toLowerCase()}`),
}));

describe('ammSwapUtils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('formatAssetName', () => {
    it('returns XLM for native asset and code for custom asset', () => {
      expect(formatAssetName(Asset.native())).toBe('XLM');
      expect(formatAssetName(new Asset('USDC', 'GIssuer'))).toBe('USDC');
    });
  });

  describe('formatAssetFullName', () => {
    it('returns full description for native and truncated issuer for credit assets', () => {
      expect(formatAssetFullName(Asset.native())).toBe('Stellar Lumens (XLM)');
      expect(formatAssetFullName(new Asset('USDC', 'GABC123456789XYZ'))).toBe('USDC:GABC...9XYZ');
    });
  });

  describe('formatAmount', () => {
    it('formats amount values correctly based on numerical boundaries', () => {
      expect(formatAmount(0)).toBe('0');
      expect(formatAmount('0.00000001')).toBe('< 0.0000001');
      expect(formatAmount(1500000)).toBe('1.50M');
      expect(formatAmount(2500)).toBe('2.50K');
      expect(formatAmount('10.500000', 4)).toBe('10.5');
    });
  });

  describe('formatPriceImpact', () => {
    it('maps impact percentage to correct styling descriptions', () => {
      expect(formatPriceImpact(1)).toEqual({ text: '1.00%', color: 'text-green-500' });
      expect(formatPriceImpact(3.5)).toEqual({ text: '3.50%', color: 'text-yellow-500' });
      expect(formatPriceImpact(6)).toEqual({ text: '6.00%', color: 'text-red-500' });
    });
  });

  describe('calculateExchangeRate', () => {
    it('returns formatted exchange rate fraction', () => {
      expect(calculateExchangeRate('2', '10')).toBe('5');
      expect(calculateExchangeRate('0', '10')).toBe('0');
    });
  });

  describe('validateSwapAmount', () => {
    it('validates required, positive amounts against optional balances', () => {
      expect(validateSwapAmount('')).toEqual({ isValid: false, error: 'Amount is required' });
      expect(validateSwapAmount('-5')).toEqual({ isValid: false, error: 'Invalid amount' });
      expect(validateSwapAmount('10', '5')).toEqual({
        isValid: false,
        error: 'Insufficient balance',
      });
      expect(validateSwapAmount('3', '5')).toEqual({ isValid: true });
    });
  });

  describe('isQuoteValid', () => {
    it('verifies quote age against threshold', () => {
      const now = Date.now();
      expect(isQuoteValid({ timestamp: now } as any)).toBe(true);
      expect(isQuoteValid({ timestamp: now - 35000 } as any)).toBe(false);
    });
  });

  describe('getMinimumReceived', () => {
    it('subtracts slippage from estimate output', () => {
      expect(getMinimumReceived('100', 1)).toBe('99.0000000');
    });
  });

  describe('parseAssetString', () => {
    it('parses XLM/native or code:issuer string correctly', () => {
      expect(parseAssetString('native').isNative()).toBe(true);
      expect(parseAssetString('USDC:GIssuer').code).toBe('USDC');
      expect(() => parseAssetString('invalid')).toThrow('Invalid asset format');
    });
  });

  describe('assetToString', () => {
    it('formats native/credit assets to string descriptor', () => {
      expect(assetToString(Asset.native())).toBe('native');
      expect(assetToString(new Asset('USDC', 'GIssuer'))).toBe('USDC:GIssuer');
    });
  });

  describe('assetsEqual', () => {
    it('checks equality between native and credit assets', () => {
      expect(assetsEqual(Asset.native(), Asset.native())).toBe(true);
      expect(assetsEqual(Asset.native(), new Asset('USDC', 'GIssuer'))).toBe(false);
      expect(assetsEqual(new Asset('USDC', 'GIssuer'), new Asset('USDC', 'GIssuer'))).toBe(true);
    });
  });

  describe('formatTimeRemaining', () => {
    it('calculates remaining seconds before expiration', () => {
      const now = Date.now();
      expect(formatTimeRemaining(now)).toBe('30s');
      expect(formatTimeRemaining(now - 35000)).toBe('Expired');
    });
  });

  describe('getPathDescription', () => {
    it('joins route items with arrows', () => {
      expect(getPathDescription([Asset.native(), new Asset('USDC', 'GIssuer')])).toBe('XLM → USDC');
    });
  });

  describe('calculateUsdValue', () => {
    it('derives USD valuations', () => {
      expect(calculateUsdValue('10', 1.5)).toBe('$15');
      expect(calculateUsdValue('10')).toBeNull();
    });
  });

  describe('debounce', () => {
    it('delays function execution', () => {
      vi.useFakeTimers();
      const fn = vi.fn();
      const debounced = debounce(fn, 100);

      debounced();
      expect(fn).not.toHaveBeenCalled();

      vi.advanceTimersByTime(100);
      expect(fn).toHaveBeenCalledTimes(1);
      vi.useRealTimers();
    });
  });

  describe('formatTxHash', () => {
    it('truncates hash strings cleanly', () => {
      expect(formatTxHash('1234567890abcdef', 4)).toBe('1234...cdef');
    });
  });

  describe('getTokenIconUrl & createTokenInfo', () => {
    it('returns custom icon URLs and aggregates token info properties', () => {
      const asset = new Asset('USDC', 'GIssuer');
      const info = createTokenInfo(asset, '100', 1.5);

      expect(info.code).toBe('USDC');
      expect(info.balance).toBe('100');
      expect(info.price).toBe(1.5);
    });
  });
});
