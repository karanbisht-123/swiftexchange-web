import { describe, expect, it, vi } from 'vitest';

import {
  generateTransactionId,
  getNetworkPrefix,
  isEVMNetwork,
  isStellarNetwork,
  isValidTransactionId,
} from '../transactionUtils';

vi.mock('../../modules/evm/utils/Chainregistry', () => ({
  getChainById: vi.fn((chainId: any) => {
    if (chainId === 1) return { symbol: 'ETH', slug: 'ethereum', name: 'Ethereum' };
    if (chainId === 56) return { name: 'BSC', slug: 'bsc' };
    return undefined;
  }),
}));

describe('transactionUtils', () => {
  describe('isEVMNetwork', () => {
    it('returns true for EVM config containing numeric chainId', () => {
      expect(isEVMNetwork({ chainId: 1 } as any)).toBe(true);
    });

    it('returns false for configurations without chainId', () => {
      expect(isEVMNetwork({ horizonUrl: 'url' } as any)).toBe(false);
    });
  });

  describe('isStellarNetwork', () => {
    it('returns true for Stellar configurations containing horizonUrl', () => {
      expect(isStellarNetwork({ horizonUrl: 'url' } as any)).toBe(true);
    });

    it('returns false for EVM configurations', () => {
      expect(isStellarNetwork({ chainId: 1 } as any)).toBe(false);
    });
  });

  describe('getNetworkPrefix', () => {
    it('handles Stellar network keys correctly', () => {
      expect(getNetworkPrefix('stellar')).toBe('/stellar');
      expect(getNetworkPrefix('pubnet')).toBe('/stellar');
      expect(getNetworkPrefix('testnet')).toBe('/stellar');
    });

    it('derives prefix from EVM chain ID symbol or slug', () => {
      expect(getNetworkPrefix(1)).toBe('/eth');
      expect(getNetworkPrefix(56)).toBe('/bsc');
    });

    it('throws error for unsupported EVM network IDs', () => {
      expect(() => getNetworkPrefix(999)).toThrow('Unsupported EVM network: 999');
    });

    it('handles custom string keys', () => {
      expect(getNetworkPrefix('sepolia')).toBe('/eth');
      expect(getNetworkPrefix('bscTestnet')).toBe('/bsc');
      expect(getNetworkPrefix('custom')).toBe('/custom');
    });

    it('throws error for unsupported types', () => {
      expect(() => getNetworkPrefix(null)).toThrow('Unsupported network type');
    });
  });

  describe('generateTransactionId & isValidTransactionId', () => {
    it('generates valid transaction identifiers and validates them', () => {
      const evmId = generateTransactionId('evm');
      const stellarId = generateTransactionId('stellar');

      expect(evmId.startsWith('evm_')).toBe(true);
      expect(stellarId.startsWith('stellar_')).toBe(true);

      expect(isValidTransactionId(evmId)).toBe(true);
      expect(isValidTransactionId(stellarId)).toBe(true);
      expect(isValidTransactionId('invalid_id')).toBe(false);
      expect(isValidTransactionId('evm_abc_123456789')).toBe(false);
    });
  });
});
