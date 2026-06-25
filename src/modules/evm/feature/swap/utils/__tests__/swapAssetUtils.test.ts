// @ts-nocheck
import { isStellar, isSameAsset, matchesAddress } from '../swapAssetUtils';

describe('swapAssetUtils', () => {
  describe('isStellar', () => {
    it('should return true for stellar chain id', () => {
      expect(isStellar('pubnet')).toBe(true);
      expect(isStellar('stellar')).toBe(true);
      expect(isStellar('testnet')).toBe(true);
    });

    it('should return false for EVM chain IDs', () => {
      expect(isStellar(1)).toBe(false);
      expect(isStellar(56)).toBe(false);
    });
  });

  describe('isSameAsset', () => {
    it('should identify native asset equivalence across different forms of address', () => {
      const assetA = { symbol: 'ETH', address: '0x0000000000000000000000000000000000000000', chainId: 1 };
      const assetB = { symbol: 'ETH', address: 'native', chainId: 1 };
      expect(isSameAsset(assetA, assetB)).toBe(true);
    });

    it('should return false for different symbols/addresses or chainIds', () => {
      const assetA = { symbol: 'USDC', address: '0x123', chainId: 1 };
      const assetB = { symbol: 'USDC', address: '0x123', chainId: 137 };
      expect(isSameAsset(assetA, assetB)).toBe(false);
    });
  });

  describe('matchesAddress', () => {
    it('should return true for native representation matching native query address', () => {
      const asset = { isNative: true, address: 'native' };
      expect(matchesAddress(asset, '0x0000000000000000000000000000000000000000')).toBe(true);
    });

    it('should match casing-insensitive addresses for ERC20', () => {
      const asset = { address: '0xABC123' };
      expect(matchesAddress(asset, '0xabc123')).toBe(true);
    });
  });
});
