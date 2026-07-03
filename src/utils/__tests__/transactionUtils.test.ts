import { describe, expect, it, vi } from 'vitest';

import { getChainById } from '../../modules/evm/utils/Chainregistry';
import {
  generateTransactionId,
  getNetworkPrefix,
  isEVMNetwork,
  isStellarNetwork,
  isValidTransactionId,
} from '../transactionUtils';

vi.mock('../../modules/evm/utils/Chainregistry', () => ({
  getChainById: vi.fn((chainId: number) => {
    const chains: Record<number, { symbol: string; slug: string; name: string }> = {
      1: { symbol: 'ETH', slug: 'ethereum', name: 'Ethereum' },
      56: { symbol: 'BNB', slug: 'bsc', name: 'BNB Smart Chain' },
      137: { symbol: 'MATIC', slug: 'polygon', name: 'Polygon' },
      999: { symbol: '', slug: '', name: 'Unknown Chain' },
    };
    return chains[chainId];
  }),
}));

const evmConfig = { chainId: 1, rpcUrl: 'https://eth.rpc' } as any;
const stellarConfig = {
  horizonUrl: 'https://horizon.stellar.org',
  networkPassphrase: 'Public',
} as any;

describe('transactionUtils', () => {
  describe('isEVMNetwork', () => {
    it('returns true for a config with a numeric chainId', () => {
      expect(isEVMNetwork(evmConfig)).toBe(true);
    });

    it('returns false for a config without a numeric chainId', () => {
      expect(isEVMNetwork(stellarConfig)).toBe(false);
    });
  });

  describe('isStellarNetwork', () => {
    it('returns true for a config with horizonUrl', () => {
      expect(isStellarNetwork(stellarConfig)).toBe(true);
    });

    it('returns false for an EVM config', () => {
      expect(isStellarNetwork(evmConfig)).toBe(false);
    });
  });

  describe('getNetworkPrefix', () => {
    it('returns /stellar for "stellar"', () => {
      expect(getNetworkPrefix('stellar')).toBe('/stellar');
    });

    it('returns /stellar for "pubnet"', () => {
      expect(getNetworkPrefix('pubnet')).toBe('/stellar');
    });

    it('returns /stellar for "testnet"', () => {
      expect(getNetworkPrefix('testnet')).toBe('/stellar');
    });

    it('returns /eth for chain ID 1', () => {
      expect(getNetworkPrefix(1)).toBe('/eth');
    });

    it('returns /bnb for chain ID 56', () => {
      expect(getNetworkPrefix(56)).toBe('/bnb');
    });

    it('returns /matic for chain ID 137', () => {
      expect(getNetworkPrefix(137)).toBe('/matic');
    });

    it('falls back to slug when symbol is empty', () => {
      vi.mocked(getChainById).mockReturnValueOnce({
        symbol: '',
        slug: 'unknown-chain',
        name: 'Unknown Chain',
      } as any);
      expect(getNetworkPrefix(999)).toBe('/unknown-chain');
    });

    it('throws for an unsupported numeric chain ID', () => {
      vi.mocked(getChainById).mockReturnValueOnce(undefined);
      expect(() => getNetworkPrefix(99999)).toThrow('Unsupported EVM network: 99999');
    });

    it('returns /eth for string "sepolia"', () => {
      expect(getNetworkPrefix('sepolia')).toBe('/eth');
    });

    it('returns /bsc for string "bscTestnet"', () => {
      expect(getNetworkPrefix('bscTestnet')).toBe('/bsc');
    });

    it('returns /customnet for an arbitrary string', () => {
      expect(getNetworkPrefix('customnet')).toBe('/customnet');
    });

    it('throws for unsupported types', () => {
      expect(() => getNetworkPrefix(null as any)).toThrow('Unsupported network type');
      expect(() => getNetworkPrefix(true as any)).toThrow('Unsupported network type');
    });
  });

  describe('generateTransactionId', () => {
    it('generates an ID with the expected format for evm', () => {
      const id = generateTransactionId('evm');
      expect(id).toMatch(/^evm_\d+_[a-z0-9]{9}$/);
    });

    it('generates an ID with the expected format for stellar', () => {
      const id = generateTransactionId('stellar');
      expect(id).toMatch(/^stellar_\d+_[a-z0-9]{9}$/);
    });

    it('generates unique IDs on successive calls', () => {
      const ids = new Set(Array.from({ length: 10 }, () => generateTransactionId('evm')));
      expect(ids.size).toBe(10);
    });
  });

  describe('isValidTransactionId', () => {
    it('returns true for a valid evm transaction ID', () => {
      const id = generateTransactionId('evm');
      expect(isValidTransactionId(id)).toBe(true);
    });

    it('returns true for a valid stellar transaction ID', () => {
      const id = generateTransactionId('stellar');
      expect(isValidTransactionId(id)).toBe(true);
    });

    it('returns false when there are fewer than 3 parts', () => {
      expect(isValidTransactionId('evm_12345')).toBe(false);
    });

    it('returns false when there are more than 3 parts', () => {
      expect(isValidTransactionId('evm_12345_abc123456_extra')).toBe(false);
    });

    it('returns false for an unsupported type prefix', () => {
      expect(isValidTransactionId('btc_1234567890_abc123456')).toBe(false);
    });

    it('returns false when timestamp is non-numeric', () => {
      expect(isValidTransactionId('evm_notanumber_abc123456')).toBe(false);
    });

    it('returns false when random segment is not 9 characters', () => {
      expect(isValidTransactionId('evm_1234567890_short')).toBe(false);
    });
  });
});
