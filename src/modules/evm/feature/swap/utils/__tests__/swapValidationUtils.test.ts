import { describe, expect, it } from 'vitest';

import {
  isAmountLessThanFee,
  isInsufficientBalance,
  isInsufficientEvmGas,
  isInsufficientStellarGas,
} from '../swapValidationUtils';

describe('isInsufficientBalance', () => {
  it('returns false when sellAmount is empty', () => {
    expect(isInsufficientBalance('', '10')).toBe(false);
  });

  it('returns false when assetBalance is undefined', () => {
    expect(isInsufficientBalance('5', undefined)).toBe(false);
  });

  it('returns true when sell amount exceeds balance', () => {
    expect(isInsufficientBalance('100', '50')).toBe(true);
  });

  it('returns false when sell amount equals balance', () => {
    expect(isInsufficientBalance('50', '50')).toBe(false);
  });

  it('returns false when sell amount is less than balance', () => {
    expect(isInsufficientBalance('10', '50')).toBe(false);
  });
});

describe('isAmountLessThanFee', () => {
  it('returns false when sellAmount is empty', () => {
    expect(isAmountLessThanFee('', '5', 'stablecoin')).toBe(false);
  });

  it('returns false when feeAmount is empty', () => {
    expect(isAmountLessThanFee('10', '', 'stablecoin')).toBe(false);
  });

  it('returns false for native feePayType regardless of amounts', () => {
    expect(isAmountLessThanFee('0.001', '1', 'native')).toBe(false);
  });

  it('returns true when sell amount equals fee for stablecoin', () => {
    expect(isAmountLessThanFee('5', '5', 'stablecoin')).toBe(true);
  });

  it('returns true when sell amount is less than fee for stablecoin', () => {
    expect(isAmountLessThanFee('1', '5', 'stablecoin')).toBe(true);
  });

  it('returns false when sell amount exceeds fee for stablecoin', () => {
    expect(isAmountLessThanFee('10', '5', 'stablecoin')).toBe(false);
  });
});

describe('isInsufficientStellarGas', () => {
  const baseParams = {
    fromChainId: 'stellar',
    stellarAssets: [{ symbol: 'XLM', balance: '5' }],
    sellAssetSymbol: 'USDC',
    sellAmount: '10',
    actionType: 'SWAP' as const,
    feePayType: 'native' as const,
    activeQuoteData: null,
  };

  it('returns false when chain is not Stellar', () => {
    expect(isInsufficientStellarGas({ ...baseParams, fromChainId: 1 })).toBe(false);
  });

  it('returns false when stellarAssets is empty', () => {
    expect(isInsufficientStellarGas({ ...baseParams, stellarAssets: [] })).toBe(false);
  });

  it('returns true when XLM asset is missing from list', () => {
    const params = { ...baseParams, stellarAssets: [{ symbol: 'USDC', balance: '100' }] };
    expect(isInsufficientStellarGas(params)).toBe(true);
  });

  it('returns false when non-XLM sell asset and XLM balance covers fees', () => {
    expect(isInsufficientStellarGas(baseParams)).toBe(false);
  });

  it('returns true when non-XLM sell asset and XLM balance is too low', () => {
    const params = { ...baseParams, stellarAssets: [{ symbol: 'XLM', balance: '0.005' }] };
    expect(isInsufficientStellarGas(params)).toBe(true);
  });

  it('returns true when selling XLM and combined amount + fee exceeds balance', () => {
    const params = {
      ...baseParams,
      sellAssetSymbol: 'XLM',
      sellAmount: '5',
      stellarAssets: [{ symbol: 'XLM', balance: '5' }],
    };
    expect(isInsufficientStellarGas(params)).toBe(true);
  });

  it('returns false when selling XLM and balance comfortably covers amount + fee', () => {
    const params = {
      ...baseParams,
      sellAssetSymbol: 'XLM',
      sellAmount: '1',
      stellarAssets: [{ symbol: 'XLM', balance: '10' }],
    };
    expect(isInsufficientStellarGas(params)).toBe(false);
  });
});

describe('isInsufficientEvmGas', () => {
  const nativeAsset = { isNative: true, symbol: 'ETH', decimals: 18, balance: '0.1' };

  const baseParams = {
    fromChainId: 1,
    swapAssets: [nativeAsset],
    selectedSellAsset: { symbol: 'USDC', isNative: false, address: '0xA0b' },
    sellAmount: '100',
    actionType: 'SWAP' as const,
    feePayType: 'native' as const,
    activeQuoteSource: 'swap' as const,
    activeQuoteData: null,
    swapQuoteNetworkFee: 0,
    isGasless: false,
  };

  it('returns false when chain is Stellar', () => {
    expect(isInsufficientEvmGas({ ...baseParams, fromChainId: 'stellar' })).toBe(false);
  });

  it('returns false when swapAssets is empty', () => {
    expect(isInsufficientEvmGas({ ...baseParams, swapAssets: [] })).toBe(false);
  });

  it('returns false when native asset is not in assets list', () => {
    const params = { ...baseParams, swapAssets: [{ isNative: false, symbol: 'USDC' }] };
    expect(isInsufficientEvmGas(params as any)).toBe(false);
  });

  it('returns false when swap is gasless', () => {
    expect(isInsufficientEvmGas({ ...baseParams, isGasless: true })).toBe(false);
  });

  it('returns false when source is fusion_plus (gasless)', () => {
    expect(isInsufficientEvmGas({ ...baseParams, activeQuoteSource: 'fusion_plus' as any })).toBe(
      false
    );
  });

  it('returns false when non-native sell asset and native balance covers gas', () => {
    expect(isInsufficientEvmGas(baseParams)).toBe(false);
  });

  it('returns true when non-native sell asset and native balance is below gas buffer', () => {
    const lowBalAsset = { ...nativeAsset, balance: '0.0001' };
    expect(isInsufficientEvmGas({ ...baseParams, swapAssets: [lowBalAsset] })).toBe(true);
  });

  it('uses quote network fee when provided for SWAP', () => {
    const lowBalAsset = { ...nativeAsset, balance: '0.005' };
    const params = { ...baseParams, swapAssets: [lowBalAsset], swapQuoteNetworkFee: 0.006 };
    expect(isInsufficientEvmGas(params)).toBe(true);
  });

  it('returns true when selling native and combined amount + gas exceeds balance', () => {
    const params = {
      ...baseParams,
      selectedSellAsset: { ...nativeAsset, isNative: true },
      sellAmount: '0.1',
    };
    expect(isInsufficientEvmGas(params)).toBe(true);
  });

  it('returns false when selling native and balance comfortably covers amount + gas', () => {
    const highBalAsset = { ...nativeAsset, balance: '5' };
    const params = {
      ...baseParams,
      swapAssets: [highBalAsset],
      selectedSellAsset: { ...highBalAsset, isNative: true },
      sellAmount: '1',
    };
    expect(isInsufficientEvmGas(params)).toBe(false);
  });
});
