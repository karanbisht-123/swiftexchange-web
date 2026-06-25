// @ts-nocheck
import {
  isInsufficientBalance,
  isAmountLessThanFee,
  isInsufficientStellarGas,
  isInsufficientEvmGas
} from '../swapValidationUtils';

describe('swapValidationUtils', () => {
  describe('isInsufficientBalance', () => {
    it('should return true when sell amount exceeds balance', () => {
      expect(isInsufficientBalance('1.5', '1.0')).toBe(true);
    });

    it('should return false when balance is sufficient', () => {
      expect(isInsufficientBalance('0.5', '1.0')).toBe(false);
    });
  });

  describe('isAmountLessThanFee', () => {
    it('should return true when sell amount is less than stablecoin fee', () => {
      expect(isAmountLessThanFee('1.0', '1.5', 'stablecoin')).toBe(true);
    });

    it('should return false when paying with native fee or amount is greater', () => {
      expect(isAmountLessThanFee('2.0', '1.5', 'stablecoin')).toBe(false);
      expect(isAmountLessThanFee('1.0', '1.5', 'native')).toBe(false);
    });
  });

  describe('isInsufficientStellarGas', () => {
    it('should check if native XLM balance covers fee reserve', () => {
      const stellarAssets = [{ symbol: 'XLM', balance: '1.5' }];
      const params = {
        fromChainId: 'pubnet',
        stellarAssets,
        sellAssetSymbol: 'XLM',
        sellAmount: '1.49', // 1.49 + 0.01 fee = 1.50 -> fits XLM balance
        actionType: 'SWAP' as const,
        feePayType: 'native' as const,
        activeQuoteData: null
      };
      expect(isInsufficientStellarGas(params)).toBe(false);

      // Sell 1.50 -> Needs 1.51 with fee, which exceeds XLM balance
      expect(isInsufficientStellarGas({ ...params, sellAmount: '1.50' })).toBe(true);
    });
  });

  describe('isInsufficientEvmGas', () => {
    it('should return false for gasless transactions or fusion quotes', () => {
      const params = {
        fromChainId: 1,
        swapAssets: [{ isNative: true, symbol: 'ETH', balance: '0.0001' }],
        selectedSellAsset: { isNative: true },
        sellAmount: '1.0',
        actionType: 'SWAP' as const,
        feePayType: 'native' as const,
        activeQuoteSource: 'fusion_plus' as const,
        activeQuoteData: null,
        swapQuoteNetworkFee: 0.05,
        isGasless: true
      };
      expect(isInsufficientEvmGas(params)).toBe(false);
    });
  });
});
