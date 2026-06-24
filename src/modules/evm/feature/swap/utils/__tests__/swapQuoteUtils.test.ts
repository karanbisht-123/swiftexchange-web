// @ts-nocheck
import {
  getCalculatedBuyAmount,
  getMinimumReceived,
  getConversionRate,
  getButtonLabel,
  getErrorMessage
} from '../swapQuoteUtils';

describe('swapQuoteUtils', () => {
  describe('getCalculatedBuyAmount', () => {
    it('should return swap output amount for active quotes', () => {
      const params = {
        actionType: 'SWAP' as const,
        isGasless: false,
        fusionQuote: null,
        showFusionScreen: false,
        selectedBuyAsset: { symbol: 'USDC', decimals: 6 },
        activeQuoteSource: 'swap' as const,
        activeQuoteData: null,
        swapQuote: { outputAmount: '123.45' },
        isSameAssetSelected: false,
        feePayType: 'native' as const
      };
      expect(getCalculatedBuyAmount(params)).toBe('123.45');
    });
  });

  describe('getMinimumReceived', () => {
    it('should calculate correct minimumReceived for EVM normal swap using slippage', () => {
      const params = {
        actionType: 'SWAP' as const,
        activeQuoteSource: 'swap' as const,
        activeQuoteData: null,
        feePayType: 'native' as const,
        fromChainId: 1,
        swapQuote: { outputAmount: '100.0' },
        selectedBuyAsset: { symbol: 'USDC', decimals: 6 },
        userSlippageTolerance: 1.0, // 1%
        calculatedBuyAmount: '100.0'
      };
      expect(getMinimumReceived(params)).toBe('99.0'); // 100 * (1 - 0.01)
    });
  });

  describe('getConversionRate', () => {
    it('should return conversion rate as string with 6 decimals', () => {
      expect(getConversionRate('2.0', '10.0')).toBe('5.000000');
    });

    it('should return 0.00 for invalid amounts', () => {
      expect(getConversionRate('0.0', '10.0')).toBe('0.00');
    });
  });

  describe('getButtonLabel', () => {
    it('should return ENTER AMOUNT if sellAmount is empty', () => {
      const params = {
        isFetchingSwapAssets: false,
        isQuoteLoading: false,
        isFetchingStellarAssets: false,
        sellAmount: '',
        isSameAssetSelected: false,
        errorMessage: null,
        isInsufficientBalance: false,
        isAmountLessThanFee: false,
        hasInsufficientStellarGas: false,
        hasInsufficientEvmGas: false,
        toChainId: 1,
        selectedBuyAsset: { symbol: 'USDC' },
        nativeSymbol: 'ETH'
      };
      expect(getButtonLabel(params)).toBe('ENTER AMOUNT');
    });
  });

  describe('getErrorMessage', () => {
    it('should map isInsufficientBalance to error string', () => {
      const params = {
        bridgeTxStatus: 'idle',
        bridgeErrorMsg: null,
        swapError: null,
        activeQuoteError: null,
        isInsufficientBalance: true,
        isAmountLessThanFee: false,
        hasInsufficientStellarGas: false,
        hasInsufficientEvmGas: false,
        isSameAssetSelected: false,
        actionType: 'SWAP' as const,
        crossChainWarning: null,
        activeQuoteData: null,
        feePayType: 'native' as const,
        nativeSymbol: 'ETH'
      };
      expect(getErrorMessage(params)).toBe('Insufficient balance for this transaction');
    });
  });
});
