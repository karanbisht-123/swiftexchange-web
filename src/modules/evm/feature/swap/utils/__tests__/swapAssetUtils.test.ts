import { describe, expect, it } from 'vitest';

import { isSameAsset, isStellar, matchesAddress } from '../swapAssetUtils';

describe('isStellar', () => {
  it('returns true for "stellar"', () => {
    expect(isStellar('stellar')).toBe(true);
  });

  it('returns true for "pubnet"', () => {
    expect(isStellar('pubnet')).toBe(true);
  });

  it('returns true for "testnet"', () => {
    expect(isStellar('testnet')).toBe(true);
  });

  it('returns false for an EVM chainId', () => {
    expect(isStellar(1)).toBe(false);
  });

  it('returns false for numeric string chainId', () => {
    expect(isStellar('137')).toBe(false);
  });
});

describe('isSameAsset', () => {
  it('returns false when either asset is falsy', () => {
    expect(isSameAsset(null, { symbol: 'ETH' })).toBe(false);
    expect(isSameAsset({ symbol: 'ETH' }, undefined)).toBe(false);
  });

  it('returns false when chainIds differ', () => {
    const a = { chainId: 1, address: '0xA', symbol: 'TOKEN' };
    const b = { chainId: 137, address: '0xA', symbol: 'TOKEN' };
    expect(isSameAsset(a, b)).toBe(false);
  });

  it('returns true for two native assets on the same chain with matching symbols', () => {
    const a = { chainId: 1, isNative: true, symbol: 'ETH' };
    const b = { chainId: 1, isNative: true, symbol: 'ETH' };
    expect(isSameAsset(a, b)).toBe(true);
  });

  it('returns false for two native assets with different symbols', () => {
    const a = { chainId: 1, isNative: true, symbol: 'ETH' };
    const b = { chainId: 1, isNative: true, symbol: 'MATIC' };
    expect(isSameAsset(a, b)).toBe(false);
  });

  it('returns false when one is native and the other is not', () => {
    const a = { chainId: 1, isNative: true, symbol: 'ETH' };
    const b = { chainId: 1, address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', symbol: 'WETH' };
    expect(isSameAsset(a, b)).toBe(false);
  });

  it('returns true for two ERC-20 tokens with the same address (case-insensitive)', () => {
    const a = { chainId: 1, address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', symbol: 'USDC' };
    const b = { chainId: 1, address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', symbol: 'USDC' };
    expect(isSameAsset(a, b)).toBe(true);
  });

  it('returns false for two ERC-20 tokens with different addresses', () => {
    const a = { chainId: 1, address: '0xAAAA', symbol: 'TKA' };
    const b = { chainId: 1, address: '0xBBBB', symbol: 'TKB' };
    expect(isSameAsset(a, b)).toBe(false);
  });

  it('treats zero address as native', () => {
    const a = { chainId: 1, address: '0x0000000000000000000000000000000000000000', symbol: 'ETH' };
    const b = { chainId: 1, isNative: true, symbol: 'ETH' };
    expect(isSameAsset(a, b)).toBe(true);
  });
});

describe('matchesAddress', () => {
  it('returns false when asset is falsy', () => {
    expect(matchesAddress(null, '0xA')).toBe(false);
  });

  it('matches native query against native asset', () => {
    const asset = { isNative: true, symbol: 'ETH' };
    expect(matchesAddress(asset, '0x0000000000000000000000000000000000000000')).toBe(true);
    expect(matchesAddress(asset, 'native')).toBe(true);
    expect(matchesAddress(asset, '')).toBe(true);
  });

  it('does not match native query against token asset', () => {
    const asset = { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', symbol: 'USDC' };
    expect(matchesAddress(asset, 'native')).toBe(false);
  });

  it('matches token address case-insensitively', () => {
    const asset = { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', symbol: 'USDC' };
    expect(matchesAddress(asset, '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48')).toBe(true);
  });

  it('does not match a different token address', () => {
    const asset = { address: '0xAAAA', symbol: 'TKA' };
    expect(matchesAddress(asset, '0xBBBB')).toBe(false);
  });
});
