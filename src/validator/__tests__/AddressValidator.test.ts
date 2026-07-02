import { describe, expect, it, vi } from 'vitest';

import { validateAddress } from '../AddressValidator';

let shouldThrow = false;

vi.mock('ethers', async () => {
  const actual = await vi.importActual<typeof import('ethers')>('ethers');
  return {
    ...actual,
    isAddress: vi.fn((addr: string) => {
      if (shouldThrow) {
        throw new Error('Forced validation error');
      }
      return actual.isAddress(addr);
    }),
  };
});

const VALID_EVM_CHECKSUM = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const VALID_EVM_LOWERCASE = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
const INVALID_EVM_CHARACTERS = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756ccg';
const INVALID_EVM_LENGTH = '0xc02aaa';

const VALID_STELLAR = 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN';
const INVALID_STELLAR = 'GCO2GW2NUIJCD7ZZHG6O75I7H626L6G6O75I7H626L6G6O75I7H626L';

const VALID_COSMOS = 'cosmos16xckn65w6vngv66s3d64b53245g663n6xckn65';
const VALID_OSMO = 'osmo16xckn65w6vngv66s3d64b53245g663n6xckn65';
const VALID_DYDX = 'dydx16xckn65w6vngv66s3d64b53245g663n6xckn65';
const INVALID_COSMOS_PREFIX = 'wrong16xckn65w6vngv66s3d64b53245g663n6xckn65';
const INVALID_COSMOS_CHARS = 'cosmos16xckn65w6vngv66s3d64b53245g663n6xckn6B'; // Uppercase 'B' is invalid

describe('validateAddress', () => {
  describe('EVM Addresses', () => {
    it('should validate a correct EVM checksum address', () => {
      const result = validateAddress(VALID_EVM_CHECKSUM, { addressType: 'evm' });
      expect(result).toBe(true);
    });

    it('should validate a correct EVM lowercase address', () => {
      const result = validateAddress(VALID_EVM_LOWERCASE, { addressType: 'evm' });
      expect(result).toBe(true);
    });

    it('should invalidate an EVM address with invalid hex characters', () => {
      const result = validateAddress(INVALID_EVM_CHARACTERS, { addressType: 'evm' });
      expect(result).toBe(false);
    });

    it('should invalidate an EVM address with incorrect length', () => {
      const result = validateAddress(INVALID_EVM_LENGTH, { addressType: 'evm' });
      expect(result).toBe(false);
    });
  });

  describe('Stellar Addresses', () => {
    it('should validate a correct Stellar public key', () => {
      const result = validateAddress(VALID_STELLAR, { addressType: 'stellar' });
      expect(result).toBe(true);
    });

    it('should invalidate an incorrect Stellar public key', () => {
      const result = validateAddress(INVALID_STELLAR, { addressType: 'stellar' });
      expect(result).toBe(false);
    });
  });

  describe('Cosmos Addresses', () => {
    it('should validate a correct cosmos address', () => {
      const result = validateAddress(VALID_COSMOS, { addressType: 'cosmos' });
      expect(result).toBe(true);
    });

    it('should validate a correct osmo address', () => {
      const result = validateAddress(VALID_OSMO, { addressType: 'cosmos' });
      expect(result).toBe(true);
    });

    it('should validate a correct dydx address', () => {
      const result = validateAddress(VALID_DYDX, { addressType: 'cosmos' });
      expect(result).toBe(true);
    });

    it('should invalidate a cosmos address with an invalid prefix', () => {
      const result = validateAddress(INVALID_COSMOS_PREFIX, { addressType: 'cosmos' });
      expect(result).toBe(false);
    });

    it('should invalidate a cosmos address with invalid characters', () => {
      const result = validateAddress(INVALID_COSMOS_CHARS, { addressType: 'cosmos' });
      expect(result).toBe(false);
    });
  });

  describe('Automatic Type Detection', () => {
    it('should auto-detect and validate EVM format', () => {
      const result = validateAddress(VALID_EVM_CHECKSUM);
      expect(result).toBe(true);
    });

    it('should auto-detect and validate Stellar format', () => {
      const result = validateAddress(VALID_STELLAR);
      expect(result).toBe(true);
    });

    it('should auto-detect and validate Cosmos format', () => {
      const result = validateAddress(VALID_COSMOS);
      expect(result).toBe(true);
    });

    it('should return false for unrecognized format during auto-detection', () => {
      const result = validateAddress('unknown_address_format');
      expect(result).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('should return false for empty string input', () => {
      const result = validateAddress('');
      expect(result).toBe(false);
    });

    it('should return false for undefined input', () => {
      const result = validateAddress(undefined as any);
      expect(result).toBe(false);
    });

    it('should return false for null input', () => {
      const result = validateAddress(null as any);
      expect(result).toBe(false);
    });

    it('should return false for non-string input (number)', () => {
      const result = validateAddress(12345 as any);
      expect(result).toBe(false);
    });

    it('should return false for whitespace string input', () => {
      const result = validateAddress('   ');
      expect(result).toBe(false);
    });

    it('should return false for a random string input', () => {
      const result = validateAddress('randomString123');
      expect(result).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should return false and log console.error when a validator throws an error', () => {
      const spyConsole = vi.spyOn(console, 'error').mockImplementation(() => {});
      shouldThrow = true;

      try {
        const result = validateAddress(VALID_EVM_CHECKSUM, { addressType: 'evm' });

        expect(result).toBe(false);
        expect(spyConsole).toHaveBeenCalled();
      } finally {
        shouldThrow = false;
        spyConsole.mockRestore();
      }
    });
  });
});
