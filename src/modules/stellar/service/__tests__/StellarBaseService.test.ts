import { beforeEach, describe, expect, it, vi } from 'vitest';

import { StellarBaseService } from '../StellarBaseService';

const mockLoadAccount = vi.fn();

vi.mock('@stellar/stellar-sdk', () => {
  class MockAsset {
    code: string;
    issuer: string;
    constructor(code: string, issuer: string) {
      this.code = code;
      this.issuer = issuer;
    }
    isNative() {
      return !this.issuer;
    }
    getCode() {
      return this.code;
    }
    getIssuer() {
      return this.issuer;
    }
    static native() {
      return new MockAsset('XLM', '');
    }
  }

  class MockServer {
    url: string;
    opts: any;
    constructor(url: string, opts?: any) {
      this.url = url;
      this.opts = opts;
    }
    loadAccount = mockLoadAccount;
  }

  return {
    Asset: MockAsset,
    Horizon: {
      Server: MockServer,
    },
    StrKey: {
      isValidEd25519PublicKey: (addr: string) => addr.startsWith('G') && addr.length === 56,
    },
  };
});

vi.mock('../../../evm/utils/Chainregistry', () => ({
  getChainById: vi.fn((chainId: any) => {
    if (chainId === 'pubnet' || chainId === 'testnet') {
      return {
        assets: [
          { symbol: 'XLM', type: 'NATIVE', name: 'Stellar', logoURI: 'xlm.png', decimals: 7 },
          {
            symbol: 'USDC',
            type: 'CREDIT',
            address: 'GIssuer',
            name: 'USD Coin',
            logoURI: 'usdc.png',
            decimals: 7,
          },
        ],
      };
    }
    return undefined;
  }),
}));

describe('StellarBaseService', () => {
  const address1 = 'GA2C5RFPE6HGOU55TMSOEDMKDTYV5VGLVLSDLQA6236NDZ6Z3E7N3YGA';
  const address2 = 'GA2C5RFPE6HGOU55TMSOEDMKDTYV5VGLVLSDLQA6236NDZ6Z3E7N3YGB';
  const address3 = 'GA2C5RFPE6HGOU55TMSOEDMKDTYV5VGLVLSDLQA6236NDZ6Z3E7N3YGC';
  const address4 = 'GA2C5RFPE6HGOU55TMSOEDMKDTYV5VGLVLSDLQA6236NDZ6Z3E7N3YGD';

  let service: StellarBaseService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new StellarBaseService(
      'https://horizon.stellar.org',
      'Public Global Stellar Network',
      'pubnet'
    );
  });

  describe('getAccountData', () => {
    it('throws error if stellar address is invalid', async () => {
      await expect(service.getAccountData('invalid')).rejects.toThrow('Invalid Stellar address');
    });

    it('fetches balance lists from Horizon server, maps assets, and caches response', async () => {
      mockLoadAccount.mockResolvedValueOnce({
        balances: [
          { asset_type: 'native', balance: '150.00' },
          {
            asset_type: 'credit_alphanum4',
            asset_code: 'USDC',
            asset_issuer: 'GIssuer',
            balance: '50.00',
          },
        ],
        subentry_count: 2,
      });

      const data1 = await service.getAccountData(address1);
      expect(data1.tokens.length).toBe(2);
      expect(data1.tokens[0].code).toBe('XLM');
      expect(data1.tokens[0].balance).toBe('150.00');
      expect(data1.tokens[1].code).toBe('USDC');
      expect(data1.tokens[1].balance).toBe('50.00');
      expect(data1.subentryCount).toBe(2);

      // Second call should hit the cache (loadAccount called only once)
      const data2 = await service.getAccountData(address1);
      expect(data2).toEqual(data1);
      expect(mockLoadAccount).toHaveBeenCalledTimes(1);
    });

    it('falls back to native balance if account is not found (404)', async () => {
      const error: any = new Error('Not Found');
      error.response = { status: 404 };
      mockLoadAccount.mockRejectedValueOnce(error);

      const data = await service.getAccountData(address2);
      expect(data.tokens.length).toBe(1);
      expect(data.tokens[0].code).toBe('XLM');
      expect(data.tokens[0].balance).toBe('0');
      expect(data.subentryCount).toBe(0);
    });
  });

  describe('getTokenBalances', () => {
    it('returns tokens from account data directly', async () => {
      mockLoadAccount.mockResolvedValueOnce({
        balances: [{ asset_type: 'native', balance: '10.00' }],
        subentry_count: 0,
      });

      const tokens = await service.getTokenBalances(address3);
      expect(tokens.length).toBe(1);
      expect(tokens[0].code).toBe('XLM');
      expect(tokens[0].balance).toBe('10.00');
    });
  });

  describe('getAssetsWithBalances', () => {
    it('properly merges registry assets with fetched stellar balance records', async () => {
      mockLoadAccount.mockResolvedValueOnce({
        balances: [{ asset_type: 'native', balance: '100.00' }],
        subentry_count: 1,
      });

      const { tokens } = await service.getAssetsWithBalances(address4);
      expect(tokens.length).toBe(2); // Native and USDC from registry config

      const xlmToken = tokens.find(t => t.code === 'XLM');
      const usdcToken = tokens.find(t => t.code === 'USDC');

      expect(xlmToken).toBeDefined();
      expect(xlmToken!.balance).toBe('100.00');
      expect(xlmToken!.hasTrustline).toBe(true);

      expect(usdcToken).toBeDefined();
      expect(usdcToken!.balance).toBe('0');
      expect(usdcToken!.hasTrustline).toBe(false);
    });
  });
});
