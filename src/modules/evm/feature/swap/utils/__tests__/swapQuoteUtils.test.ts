import { describe, expect, it } from 'vitest';

import {
  getButtonLabel,
  getCalculatedBuyAmount,
  getConversionRate,
  getErrorMessage,
  getMinimumReceived,
} from '../swapQuoteUtils';

const ETH_ASSET = { symbol: 'ETH', decimals: 18, isNative: true };
const USDC_ASSET = { symbol: 'USDC', decimals: 6 };

describe('getConversionRate', () => {
  it('returns "0.00" when sell amount is zero', () => {
    expect(getConversionRate('0', '3000')).toBe('0.00');
  });

  it('returns "0.00" when buy amount is zero', () => {
    expect(getConversionRate('1', '0')).toBe('0.00');
  });

  it('returns "0.00" for non-numeric inputs', () => {
    expect(getConversionRate('abc', 'xyz')).toBe('0.00');
  });

  it('calculates rate correctly to 6 decimal places', () => {
    expect(getConversionRate('1', '3000')).toBe('3000.000000');
  });

  it('calculates fractional rate correctly', () => {
    expect(getConversionRate('3000', '1')).toBe('0.000333');
  });
});

describe('getCalculatedBuyAmount', () => {
  const baseSwapParams = {
    actionType: 'SWAP' as const,
    isGasless: false,
    fusionQuote: null,
    showFusionScreen: false,
    selectedBuyAsset: USDC_ASSET,
    activeQuoteSource: 'swap' as const,
    activeQuoteData: null,
    swapQuote: { outputAmount: '3000' },
    isSameAssetSelected: false,
    feePayType: 'native' as const,
  };

  it('returns "SELECT DIFFERENT PAIR" when same asset selected', () => {
    expect(getCalculatedBuyAmount({ ...baseSwapParams, isSameAssetSelected: true })).toBe(
      'SELECT DIFFERENT PAIR'
    );
  });

  it('returns swapQuote outputAmount for a standard SWAP', () => {
    expect(getCalculatedBuyAmount(baseSwapParams)).toBe('3000');
  });

  it('returns "0.00" when swap quote is absent', () => {
    expect(getCalculatedBuyAmount({ ...baseSwapParams, swapQuote: null })).toBe('0.00');
  });

  it('returns stellar estimatedOutput for stellar SWAP', () => {
    const params = {
      ...baseSwapParams,
      activeQuoteSource: 'stellar' as const,
      activeQuoteData: { estimatedOutput: '150.5' },
    };
    expect(getCalculatedBuyAmount(params)).toBe('150.5');
  });

  it('returns formatted fusion output for gasless SWAP with fusion quote', () => {
    const fusionQuote = { toTokenAmount: '5000000000000000000' };
    const params = {
      ...baseSwapParams,
      isGasless: true,
      showFusionScreen: true,
      fusionQuote,
      selectedBuyAsset: ETH_ASSET,
    };
    expect(getCalculatedBuyAmount(params)).toBe('5.0');
  });

  it('returns bridge minimumAmountOut for BRIDGE with bridge source', () => {
    const params = {
      ...baseSwapParams,
      actionType: 'BRIDGE' as const,
      activeQuoteSource: 'bridge' as const,
      activeQuoteData: { minimumAmountOut: '2900' },
      swapQuote: null,
    };
    expect(getCalculatedBuyAmount(params)).toBe('2900');
  });

  it('returns net bridge amount after stablecoin fee deduction', () => {
    const params = {
      ...baseSwapParams,
      actionType: 'BRIDGE' as const,
      activeQuoteSource: 'bridge' as const,
      feePayType: 'stablecoin' as const,
      activeQuoteData: { minimumAmountOut: '100', fee: { stablecoin: { amount: '2' } } },
      swapQuote: null,
    };
    const result = getCalculatedBuyAmount(params);
    expect(parseFloat(result)).toBeCloseTo(98, 5);
  });

  it('returns formatted fusion_plus output for cross-chain BRIDGE', () => {
    const params = {
      ...baseSwapParams,
      actionType: 'BRIDGE' as const,
      activeQuoteSource: 'fusion_plus' as const,
      activeQuoteData: { toTokenAmount: '2000000' },
      selectedBuyAsset: USDC_ASSET,
      swapQuote: null,
    };
    expect(getCalculatedBuyAmount(params)).toBe('2.0');
  });
});

describe('getMinimumReceived', () => {
  const baseParams = {
    actionType: 'SWAP' as const,
    activeQuoteSource: null as any,
    activeQuoteData: null,
    feePayType: 'native' as const,
    fromChainId: 1,
    swapQuote: { outputAmount: '1.0', minimumReceived: null as any },
    selectedBuyAsset: ETH_ASSET,
    userSlippageTolerance: 1,
    calculatedBuyAmount: '1.0',
  };

  it('returns "0.00" when no quote is available', () => {
    expect(getMinimumReceived({ ...baseParams, swapQuote: null })).toBe('0.00');
  });

  it('uses quote.minimumReceived when already provided by the API', () => {
    const params = { ...baseParams, swapQuote: { outputAmount: '1.0', minimumReceived: '0.99' } };
    expect(getMinimumReceived(params)).toBe('0.99');
  });

  it('computes minimum received using slippage when not provided by the API', () => {
    const params = {
      ...baseParams,
      swapQuote: { outputAmount: '1.0', minimumReceived: null },
      userSlippageTolerance: 1,
    };
    const result = parseFloat(getMinimumReceived(params));
    expect(result).toBeCloseTo(0.99, 4);
  });

  it('returns bridge minimumAmountOut for BRIDGE with bridge source', () => {
    const params = {
      ...baseParams,
      actionType: 'BRIDGE' as const,
      activeQuoteSource: 'bridge' as const,
      activeQuoteData: { minimumAmountOut: '2900' },
    };
    expect(getMinimumReceived(params)).toBe('2900');
  });

  it('returns stellar minimumOutput for stellar SWAP', () => {
    const params = {
      ...baseParams,
      fromChainId: 'stellar',
      activeQuoteSource: 'stellar' as const,
      activeQuoteData: { minimumOutput: '149.25' },
    };
    expect(getMinimumReceived(params)).toBe('149.25');
  });
});

describe('getButtonLabel', () => {
  const baseParams = {
    isFetchingSwapAssets: false,
    isQuoteLoading: false,
    isFetchingStellarAssets: false,
    sellAmount: '1',
    isSameAssetSelected: false,
    errorMessage: null as string | null,
    isInsufficientBalance: false,
    isAmountLessThanFee: false,
    hasInsufficientStellarGas: false,
    hasInsufficientEvmGas: false,
    toChainId: 1,
    selectedBuyAsset: ETH_ASSET,
    nativeSymbol: 'ETH',
  };

  it('returns "FETCHING QUOTES..." when loading assets', () => {
    expect(getButtonLabel({ ...baseParams, isFetchingSwapAssets: true })).toBe(
      'FETCHING QUOTES...'
    );
  });

  it('returns "FETCHING QUOTES..." when quote is loading', () => {
    expect(getButtonLabel({ ...baseParams, isQuoteLoading: true })).toBe('FETCHING QUOTES...');
  });

  it('returns "ENTER AMOUNT" when sell amount is empty', () => {
    expect(getButtonLabel({ ...baseParams, sellAmount: '' })).toBe('ENTER AMOUNT');
  });

  it('returns "ENTER AMOUNT" when sell amount is zero', () => {
    expect(getButtonLabel({ ...baseParams, sellAmount: '0' })).toBe('ENTER AMOUNT');
  });

  it('returns "SELECT DIFFERENT ASSET" when same asset is selected', () => {
    expect(getButtonLabel({ ...baseParams, isSameAssetSelected: true })).toBe(
      'SELECT DIFFERENT ASSET'
    );
  });

  it('returns "INSUFFICIENT BALANCE" for balance error', () => {
    expect(getButtonLabel({ ...baseParams, isInsufficientBalance: true })).toBe(
      'INSUFFICIENT BALANCE'
    );
  });

  it('returns "AMOUNT LESS THAN FEE"', () => {
    expect(getButtonLabel({ ...baseParams, isAmountLessThanFee: true })).toBe(
      'AMOUNT LESS THAN FEE'
    );
  });

  it('returns "INSUFFICIENT XLM FOR FEE" for Stellar gas error', () => {
    expect(getButtonLabel({ ...baseParams, hasInsufficientStellarGas: true })).toBe(
      'INSUFFICIENT XLM FOR FEE'
    );
  });

  it('returns dynamic gas error for insufficient EVM gas', () => {
    expect(getButtonLabel({ ...baseParams, hasInsufficientEvmGas: true })).toBe(
      'INSUFFICIENT ETH FOR GAS'
    );
  });

  it('returns short error message uppercased when under 45 chars', () => {
    expect(getButtonLabel({ ...baseParams, errorMessage: 'price impact too high' })).toBe(
      'PRICE IMPACT TOO HIGH'
    );
  });

  it('returns "SWAP FAILED" when error message is longer than 45 chars', () => {
    const longMsg = 'This is a very long error message that exceeds the character limit';
    expect(getButtonLabel({ ...baseParams, errorMessage: longMsg })).toBe('SWAP FAILED');
  });

  it('returns "SWAP" when everything is valid', () => {
    expect(getButtonLabel(baseParams)).toBe('SWAP');
  });
});

describe('getErrorMessage', () => {
  const baseParams = {
    bridgeTxStatus: 'idle',
    bridgeErrorMsg: null as string | null,
    swapError: null as string | null,
    activeQuoteError: null as string | null,
    isInsufficientBalance: false,
    isAmountLessThanFee: false,
    hasInsufficientStellarGas: false,
    hasInsufficientEvmGas: false,
    isSameAssetSelected: false,
    actionType: 'SWAP' as const,
    crossChainWarning: null as string | null,
    activeQuoteData: null,
    feePayType: 'native' as const,
    nativeSymbol: 'ETH',
  };

  it('returns null when no errors exist', () => {
    expect(getErrorMessage(baseParams)).toBeNull();
  });

  it('returns bridge error when bridgeTxStatus is "error"', () => {
    const msg = getErrorMessage({
      ...baseParams,
      bridgeTxStatus: 'error',
      bridgeErrorMsg: 'Bridge failed',
    });
    expect(msg).toBe('Bridge failed');
  });

  it('returns default message when bridge errors without a message', () => {
    const msg = getErrorMessage({ ...baseParams, bridgeTxStatus: 'error' });
    expect(msg).toBe('Transaction failed. Please try again.');
  });

  it('returns swapError when present', () => {
    expect(getErrorMessage({ ...baseParams, swapError: 'Slippage exceeded' })).toBe(
      'Slippage exceeded'
    );
  });

  it('returns activeQuoteError when present', () => {
    expect(getErrorMessage({ ...baseParams, activeQuoteError: 'No route found' })).toBe(
      'No route found'
    );
  });

  it('returns insufficient balance message', () => {
    const msg = getErrorMessage({ ...baseParams, isInsufficientBalance: true });
    expect(msg).toBe('Insufficient balance for this transaction');
  });

  it('returns insufficient EVM gas message', () => {
    const msg = getErrorMessage({ ...baseParams, hasInsufficientEvmGas: true });
    expect(msg).toBe('Insufficient ETH balance for gas fees.');
  });

  it('returns same asset error message', () => {
    const msg = getErrorMessage({ ...baseParams, isSameAssetSelected: true });
    expect(msg).toBe('Please select different assets to swap');
  });

  it('returns cross-chain warning for BRIDGE action', () => {
    const msg = getErrorMessage({
      ...baseParams,
      actionType: 'BRIDGE',
      crossChainWarning: 'Route unavailable',
    });
    expect(msg).toBe('Route unavailable');
  });
});
