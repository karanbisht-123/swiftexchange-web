import { describe, expect, it } from 'vitest';

import { formatAmount, getGasBuffer, toPlainString } from '../swapAmountUtils';

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
  it('returns the BSC buffer for chainId 56', () => {
    const buf = getGasBuffer(56, 18);
    expect(buf).toBe(BigInt('500000000000000'));
  });

  it('returns the Polygon buffer for chainId 137', () => {
    const buf = getGasBuffer(137, 18);
    expect(buf).toBe(BigInt('100000000000000000'));
  });

  it('returns the L2 buffer for Arbitrum (42161)', () => {
    const buf = getGasBuffer(42161, 18);
    expect(buf).toBe(BigInt('500000000000000'));
  });

  it('returns the L2 buffer for Optimism (10)', () => {
    const buf = getGasBuffer(10, 18);
    expect(buf).toBe(BigInt('500000000000000'));
  });

  it('returns the L2 buffer for Base (8453)', () => {
    const buf = getGasBuffer(8453, 18);
    expect(buf).toBe(BigInt('500000000000000'));
  });

  it('returns the Stellar buffer for pubnet', () => {
    const buf = getGasBuffer('pubnet', 7);
    expect(buf).toBe(BigInt('100000'));
  });

  it('returns the Stellar buffer for stellar chainId', () => {
    const buf = getGasBuffer('stellar', 7);
    expect(buf).toBe(BigInt('100000'));
  });

  it('returns the default ETH buffer for mainnet (chainId 1)', () => {
    const buf = getGasBuffer(1, 18);
    expect(buf).toBe(BigInt('3000000000000000'));
  });
});
