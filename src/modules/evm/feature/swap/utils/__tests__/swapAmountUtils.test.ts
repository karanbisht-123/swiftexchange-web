import { describe, expect, it } from 'vitest';

import {
  calculateMaxSwapAmount,
  formatAmount,
  getGasBuffer,
  toPlainString,
} from '../swapAmountUtils';

describe('toPlainString', () => {
  it('returns "0" for null', () => {
    expect(toPlainString(null)).toBe('0');
  });

  it('returns "0" for undefined', () => {
    expect(toPlainString(undefined)).toBe('0');
  });

  it('returns "0" for NaN string', () => {
    expect(toPlainString('abc')).toBe('0');
  });

  it('returns the value as-is when no scientific notation', () => {
    expect(toPlainString('1.23456')).toBe('1.23456');
  });

  it('converts scientific notation to plain decimal string', () => {
    const result = toPlainString('1.5e-8');
    expect(result).toBe('0.000000015');
  });

  it('converts large scientific notation to plain string', () => {
    const result = toPlainString('1.5e+20');
    expect(parseFloat(result)).toBeCloseTo(1.5e20, -5);
  });

  it('handles numeric 0', () => {
    expect(toPlainString(0)).toBe('0');
  });

  it('handles a normal number', () => {
    expect(toPlainString(42.5)).toBe('42.5');
  });
});

describe('formatAmount', () => {
  it('returns "0" for empty string', () => {
    expect(formatAmount('', 18)).toBe('0');
  });

  it('converts 1 ETH to its smallest unit with 18 decimals', () => {
    expect(formatAmount('1', 18)).toBe('1000000000000000000');
  });

  it('converts 1.5 USDC (6 decimals) to its smallest unit', () => {
    expect(formatAmount('1.5', 6)).toBe('1500000');
  });

  it('truncates fractional digits beyond the specified decimals', () => {
    expect(formatAmount('1.123456789', 6)).toBe('1123456');
  });

  it('handles whole number amounts', () => {
    expect(formatAmount('100', 6)).toBe('100000000');
  });

  it('returns the raw value on a parse error', () => {
    const result = formatAmount('not-a-number', 18);
    expect(result).toBe('not-a-number');
  });
});

describe('getGasBuffer', () => {
  it('returns the dynamic fee with 20% margin when networkFee is provided', () => {
    // 0.00001 ETH -> 0.000012 ETH (12000000000000 wei)
    const buf = getGasBuffer(1, 18, 0.00001);
    expect(buf).toBe(BigInt('12000000000000'));
  });

  it('returns the Stellar buffer for pubnet / stellar chain', () => {
    const buf = getGasBuffer('pubnet', 7);
    expect(buf).toBe(BigInt('100000')); // 0.01 XLM
  });

  it('returns the default minimal buffer for EVM chains before quote arrives', () => {
    const buf = getGasBuffer(1, 18);
    expect(buf).toBe(BigInt('100000000000000')); // 0.0001 ETH
  });
});

describe('calculateMaxSwapAmount', () => {
  it('returns 0 for empty or 0 balance', () => {
    expect(calculateMaxSwapAmount({ balance: '0', chainId: 1 })).toBe('0');
    expect(calculateMaxSwapAmount({ balance: null, chainId: 1 })).toBe('0');
    expect(calculateMaxSwapAmount({ balance: undefined, chainId: 1 })).toBe('0');
  });

  it('returns 100% of balance for ERC-20 non-native tokens', () => {
    const result = calculateMaxSwapAmount({
      balance: '150.55',
      decimals: 6,
      isNative: false,
      chainId: 1,
    });
    expect(result).toBe('150.55');
  });

  it('returns 100% of balance for gasless Fusion swaps', () => {
    const result = calculateMaxSwapAmount({
      balance: '1.25',
      decimals: 18,
      isNative: true,
      isGasless: true,
      actionType: 'SWAP',
      chainId: 1,
    });
    expect(result).toBe('1.25');
  });

  it('deducts bridge native fee for gasless bridge trades with native fee', () => {
    const result = calculateMaxSwapAmount({
      balance: '1.0',
      decimals: 18,
      isNative: true,
      isGasless: true,
      chainId: 1,
      actionType: 'BRIDGE',
      feePayType: 'native',
      bridgeNativeFee: '0.005',
    });
    // With isGasless=true, network gas is 0, but bridge fee 0.005 ETH is still deducted: 1.0 - 0.005 = 0.995 ETH
    expect(result).toBe('0.995');
  });

  it('deducts dynamic network fee with safety margin for native token when balance is sufficient', () => {
    // Balance: 0.000542 ETH, Fee: 0.000017 ETH -> gas buffer: 0.0000204 ETH
    // Max: 0.000542 - 0.0000204 = 0.0005216 ETH
    const result = calculateMaxSwapAmount({
      balance: '0.000542',
      decimals: 18,
      isNative: true,
      isGasless: false,
      networkFee: 0.000017,
      chainId: 1,
    });
    expect(result).toBe('0.0005216');
  });

  it('returns 0 if balance is less than required gas buffer instead of giving invalid full balance', () => {
    const result = calculateMaxSwapAmount({
      balance: '0.00001',
      decimals: 18,
      isNative: true,
      isGasless: false,
      chainId: 1,
    });
    expect(result).toBe('0');
  });

  it('deducts bridge native fee if actionType is BRIDGE and feePayType is native', () => {
    const result = calculateMaxSwapAmount({
      balance: '1.0',
      decimals: 18,
      isNative: true,
      chainId: 1,
      actionType: 'BRIDGE',
      feePayType: 'native',
      bridgeNativeFee: '0.005',
    });
    // Default buffer 0.0001 + 0.005 = 0.0051 ETH -> 1.0 - 0.0051 = 0.9949 ETH
    expect(result).toBe('0.9949');
  });

  it('returns "0" on try-block error when isNative is true', () => {
    const result = calculateMaxSwapAmount({
      balance: '10.5',
      decimals: 999999, // invalid decimals causes ethers parseUnits to throw
      isNative: true,
      chainId: 1,
    });
    expect(result).toBe('0');
  });

  it('returns raw toPlainString(balance) on try-block error when isNative is false', () => {
    const result = calculateMaxSwapAmount({
      balance: '10.5',
      decimals: 999999, // invalid decimals causes ethers parseUnits to throw
      isNative: false,
      chainId: 1,
    });
    expect(result).toBe('10.5');
  });
});
