import { describe, expect, it, vi } from 'vitest';

import {
  buildSwapUrl,
  isDirectDeposit,
  isDydxChain,
  isPriorityAsset,
  isStellarAsset,
  needsSwapToUsdc,
} from '../Depositassetutils';

vi.mock('../../../walletconnect/store/portfolioStore', () => ({}));
vi.mock('@dydxprotocol/v4-client-js', () => {
  class MockCompositeClient {
    static connect = vi.fn().mockResolvedValue({ validatorClient: {} });
  }
  class MockIndexerClient {}
  class MockValidatorClient {}
  class MockValidatorConfig {}

  return {
    CompositeClient: MockCompositeClient,
    IndexerClient: MockIndexerClient,
    ValidatorClient: MockValidatorClient,
    ValidatorConfig: MockValidatorConfig,
    Network: {
      mainnet: vi.fn(() => ({ indexerConfig: { websocketEndpoint: '' }, validatorConfig: {} })),
      testnet: vi.fn(() => ({ indexerConfig: { websocketEndpoint: '' }, validatorConfig: {} })),
    },
    tradingKeyUtils: {
      createNewRandomDydxWallet: vi.fn(),
      getAuthorizeNewTradingKeyArguments: vi.fn(),
    },
  };
});

describe('Depositassetutils', () => {
  const stellarAsset: any = { chainId: 'pubnet', symbol: 'USDC', address: 'G123' };
  const evmNativeAsset: any = { chainId: 1, symbol: 'ETH', isNative: true };
  const evmUsdcAsset: any = { chainId: 1, symbol: 'USDC', address: '0xUSDC' };
  const evmTokenAsset: any = { chainId: 1, symbol: 'UNI', address: '0xUNI' };
  const dydxAsset: any = { chainId: 'dydx-mainnet-1', symbol: 'USDC' };

  describe('isStellarAsset', () => {
    it('detects stellar assets accurately', () => {
      expect(isStellarAsset(stellarAsset)).toBe(true);
      expect(isStellarAsset({ chainId: 'testnet' } as any)).toBe(true);
      expect(isStellarAsset({ chainType: 'stellar' } as any)).toBe(true);
      expect(isStellarAsset(evmNativeAsset)).toBe(false);
    });
  });

  describe('isDydxChain', () => {
    it('detects dydx chains accurately', () => {
      expect(isDydxChain('dydx-mainnet-1')).toBe(true);
      expect(isDydxChain(1)).toBe(false);
    });
  });

  describe('needsSwapToUsdc', () => {
    it('returns true for non-USDC non-native EVM tokens', () => {
      expect(needsSwapToUsdc(evmTokenAsset)).toBe(true);
    });

    it('returns false for stellar, dydx, native, or USDC EVM assets', () => {
      expect(needsSwapToUsdc(stellarAsset)).toBe(false);
      expect(needsSwapToUsdc(dydxAsset)).toBe(false);
      expect(needsSwapToUsdc(evmNativeAsset)).toBe(false);
      expect(needsSwapToUsdc(evmUsdcAsset)).toBe(false);
    });
  });

  describe('isDirectDeposit', () => {
    it('returns true only for direct non-swap EVM deposits (EVM USDC)', () => {
      expect(isDirectDeposit(evmUsdcAsset)).toBe(true);
      expect(isDirectDeposit(stellarAsset)).toBe(false);
      expect(isDirectDeposit(evmTokenAsset)).toBe(false);
    });
  });

  describe('buildSwapUrl', () => {
    it('builds the swap URL with correct params', () => {
      const url = buildSwapUrl(evmTokenAsset);
      expect(url).toContain('/trading/swap?');
      expect(url).toContain('fromChainId=1');
      expect(url).toContain('toChainId=1');
      expect(url).toContain('sellAsset=UNI');
      expect(url).toContain('sellAddress=0xUNI');
      expect(url).toContain('buyAsset=USDC');
      expect(url).toContain('returnTo=deposit');
    });

    it('sets correct toChainId for stellar swaps', () => {
      const url = buildSwapUrl(stellarAsset, 137);
      expect(url).toContain('fromChainId=pubnet');
      expect(url).toContain('toChainId=137');
    });
  });

  describe('isPriorityAsset', () => {
    it('checks priority classification accurately', () => {
      expect(isPriorityAsset(stellarAsset)).toBe(true); // USDC
      expect(isPriorityAsset(evmNativeAsset)).toBe(true); // Native
      expect(isPriorityAsset(evmTokenAsset)).toBe(false); // UNI
    });
  });
});
