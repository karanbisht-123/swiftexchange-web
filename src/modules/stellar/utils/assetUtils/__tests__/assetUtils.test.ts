import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildTrustlineTransaction,
  formatAssetBalance,
  getAssetKey,
  isNativeAsset,
  signAndSubmitTrustline,
  sortAssets,
  truncateAddress,
  validateStellarAddress,
} from '../assetUtils';

vi.mock('@stellar/stellar-sdk', () => {
  class MockAccount {
    accountId: string;
    sequence: string;
    constructor(address: string, sequence: string) {
      this.accountId = address;
      this.sequence = sequence;
    }
    sequenceNumber() {
      return this.sequence;
    }
  }

  class MockAsset {
    code: string;
    issuer: string;
    constructor(code: string, issuer: string) {
      this.code = code;
      this.issuer = issuer;
    }
    static native() {
      return new MockAsset('XLM', '');
    }
  }

  const mockAddOperation = vi.fn().mockReturnThis();
  const mockSetTimeout = vi.fn().mockReturnThis();
  const mockBuild = vi.fn().mockReturnValue({
    toXDR: () => 'mock_xdr',
  });

  class MockTransactionBuilder {
    account: any;
    opts: any;
    constructor(account: any, opts: any) {
      this.account = account;
      this.opts = opts;
    }
    addOperation = mockAddOperation;
    setTimeout = mockSetTimeout;
    build = mockBuild;
  }

  return {
    Account: MockAccount,
    Asset: MockAsset,
    BASE_FEE: '100',
    Networks: {
      TESTNET: 'Test SDF Network ; September 2015',
    },
    Operation: {
      changeTrust: vi.fn(opts => opts),
    },
    TransactionBuilder: MockTransactionBuilder,
  };
});

vi.mock('../../../../walletconnect/config/chains', () => ({
  getStellarConfig: vi.fn(() => ({ networkPassphrase: 'mock_passphrase' })),
}));

vi.mock('../../StellarSequenceTracker', () => ({
  StellarSequenceTracker: {
    getAndIncrementSequence: vi.fn(() => '100'),
  },
}));

vi.mock('../../transactionService', () => ({
  signAndSubmitTransaction: vi.fn(args => {
    if (args.xdr === 'success_xdr') return { success: true, hash: 'hash123' };
    return { success: false, error: 'failed' };
  }),
}));

describe('assetUtils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('buildTrustlineTransaction', () => {
    it('loads account details and constructs changes trust XDR', async () => {
      const mockServer = {
        loadAccount: vi.fn().mockResolvedValue({
          sequenceNumber: () => '100',
        }),
      };

      const xdr = await buildTrustlineTransaction({
        server: mockServer as any,
        stellarAddress: 'GAddress',
        assetCode: 'USDC',
        assetIssuer: 'GIssuer',
        currentNetwork: 'testnet',
      });

      expect(xdr).toBe('mock_xdr');
      expect(mockServer.loadAccount).toHaveBeenCalledWith('GAddress');
    });
  });

  describe('signAndSubmitTrustline', () => {
    it('maps successful transaction results correctly', async () => {
      const res = await signAndSubmitTrustline('success_xdr', 'testnet', 'mock_pass', null);
      expect(res).toEqual({
        success: true,
        transactionHash: 'hash123',
      });
    });

    it('maps failed transaction results correctly', async () => {
      const res = await signAndSubmitTrustline('fail_xdr', 'testnet', 'mock_pass', null);
      expect(res).toEqual({
        success: false,
        error: 'failed',
      });
    });
  });

  describe('formatAssetBalance', () => {
    it('formats balance values correctly based on numerical boundaries', () => {
      expect(formatAssetBalance('0')).toBe('0.00');
      expect(formatAssetBalance('0.005')).toBe('0.0050000');
      expect(formatAssetBalance('0.5')).toBe('0.5000');
      expect(formatAssetBalance('15.5')).toBe('15.50');
      expect(formatAssetBalance('1000')).toBe('1,000.00');
    });
  });

  describe('truncateAddress', () => {
    it('truncates longer addresses with middle ellipsis', () => {
      expect(truncateAddress('GA1234567890BC', 2, 2)).toBe('GA...BC');
      expect(truncateAddress('short', 4, 4)).toBe('short');
    });
  });

  describe('validateStellarAddress', () => {
    it('validates correct G prefix Ed25519 addresses', () => {
      expect(
        validateStellarAddress('GA2C5RFPE6HGOU55TMSOEDMKDTYV5VGLVLSDLQA6236NDZ6Z3E7N3YGG')
      ).toBe(true);
      expect(validateStellarAddress('invalid')).toBe(false);
    });
  });

  describe('getAssetKey', () => {
    it('returns combined code and issuer key', () => {
      expect(getAssetKey('USDC', 'GIssuer')).toBe('USDC-GIssuer');
    });
  });

  describe('isNativeAsset', () => {
    it('checks for native asset type', () => {
      expect(isNativeAsset('native')).toBe(true);
      expect(isNativeAsset('credit_alphanum4')).toBe(false);
    });
  });

  describe('sortAssets', () => {
    it('sorts assets by trusted status then by alphabetical name/code', () => {
      const assets = [
        { isTrusted: false, code: 'Z' },
        { isTrusted: true, code: 'X' },
        { isTrusted: true, code: 'A' },
      ];

      const sorted = sortAssets(assets);
      expect(sorted[0].code).toBe('A');
      expect(sorted[1].code).toBe('X');
      expect(sorted[2].code).toBe('Z');
    });
  });
});
