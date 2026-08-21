import { useMemo } from 'react';

import type { UnifiedAsset, UnifiedQuote } from '../types/swap.types';
import { isSameAsset as checkSameAsset } from '../utils/swapAssetUtils';
import {
  getMinimumReceived as checkMinimumReceived,
  getButtonLabel,
  getCalculatedBuyAmount,
  getConversionRate,
  getErrorMessage,
} from '../utils/swapQuoteUtils';
import {
  isAmountLessThanFee as checkAmountLessThanFee,
  isInsufficientBalance as checkInsufficientBalance,
  isInsufficientEvmGas as checkInsufficientEvmGas,
  isInsufficientStellarGas as checkInsufficientStellarGas,
} from '../utils/swapValidationUtils';

export interface UseSwapValidationParams {
  sellAmount: string;
  selectedSellAsset: UnifiedAsset | null;
  selectedBuyAsset: UnifiedAsset | null;
  actionType: 'SWAP' | 'BRIDGE';
  feePayType: 'native' | 'stablecoin';
  fromChainId: number | string;
  toChainId: number | string;
  stellarAssets: any[];
  swapAssets: any[];
  currentQuote: UnifiedQuote;
  isGasless: boolean;
  bridgeTxStatus: string;
  bridgeErrorMsg: string | null;
  swapError: string | null;
  crossChainWarning: string | null;
  isFetchingSwapAssets: boolean;
  isQuoteLoading: boolean;
  isFetchingStellarAssets: boolean;
  userSlippageTolerance: number;
  showFusionScreen: boolean;
  missingWallets?: string[];
  isStellarAccountActive?: boolean | null;
}

export function useSwapValidation(params: UseSwapValidationParams) {
  const {
    sellAmount,
    selectedSellAsset,
    selectedBuyAsset,
    actionType,
    feePayType,
    fromChainId,
    toChainId,
    stellarAssets,
    swapAssets,
    currentQuote,
    isGasless,
    bridgeTxStatus,
    bridgeErrorMsg,
    swapError,
    crossChainWarning,
    isFetchingSwapAssets,
    isQuoteLoading,
    isFetchingStellarAssets,
    userSlippageTolerance,
    showFusionScreen,
    missingWallets,
    isStellarAccountActive,
  } = params;

  const isWalletMissing = !!(missingWallets && missingWallets.length > 0);

  const isInsufficientBalance = useMemo(() => {
    if (isWalletMissing) return false;
    return checkInsufficientBalance(sellAmount, selectedSellAsset?.balance);
  }, [sellAmount, selectedSellAsset, isWalletMissing]);

  const isSameAssetSelected = useMemo(() => {
    return (
      actionType === 'SWAP' &&
      fromChainId === toChainId &&
      checkSameAsset(selectedSellAsset, selectedBuyAsset) &&
      !!selectedSellAsset
    );
  }, [actionType, fromChainId, toChainId, selectedSellAsset, selectedBuyAsset]);

  const isAmountLessThanFee = useMemo(() => {
    if (actionType !== 'BRIDGE' || !sellAmount || !currentQuote.data) return false;
    const feeAmount = (currentQuote.data as any).fee?.stablecoin?.amount || '0';
    return checkAmountLessThanFee(sellAmount, feeAmount, feePayType);
  }, [actionType, sellAmount, currentQuote.data, feePayType]);

  const hasInsufficientStellarGas = useMemo(() => {
    if (isWalletMissing) return false;
    const hasQuote = !!currentQuote.data;
    if (isQuoteLoading || isFetchingStellarAssets || !hasQuote) {
      return false;
    }
    return checkInsufficientStellarGas({
      fromChainId,
      stellarAssets,
      sellAssetSymbol: selectedSellAsset?.symbol || '',
      sellAmount,
      actionType,
      feePayType,
      activeQuoteData: currentQuote.data,
    });
  }, [
    fromChainId,
    stellarAssets,
    selectedSellAsset,
    sellAmount,
    actionType,
    feePayType,
    currentQuote.data,
    isQuoteLoading,
    isFetchingStellarAssets,
    isWalletMissing,
  ]);

  const hasInsufficientEvmGas = useMemo(() => {
    if (isWalletMissing) return false;
    const hasQuote = !!currentQuote.data;

    if (isQuoteLoading || isFetchingSwapAssets || !hasQuote) {
      return false;
    }

    const swapQuoteNetworkFee =
      currentQuote.source === 'EVM_SWAP' ? (currentQuote.data as any)?.networkFee : undefined;

    return checkInsufficientEvmGas({
      fromChainId,
      swapAssets,
      selectedSellAsset: selectedSellAsset as any,
      sellAmount,
      actionType,
      feePayType,
      activeQuoteSource: currentQuote.source,
      activeQuoteData: currentQuote.data,
      swapQuoteNetworkFee,
      isGasless,
    });
  }, [
    fromChainId,
    swapAssets,
    selectedSellAsset,
    sellAmount,
    actionType,
    feePayType,
    currentQuote.source,
    currentQuote.data,
    isGasless,
    isQuoteLoading,
    isFetchingSwapAssets,
    isWalletMissing,
  ]);

  const nativeSymbol = useMemo(() => {
    const nativeAsset = swapAssets.find(a => a.isNative);
    return nativeAsset?.symbol || 'ETH';
  }, [swapAssets]);

  const errorMessage = useMemo(() => {
    return getErrorMessage({
      bridgeTxStatus,
      bridgeErrorMsg,
      swapError,
      activeQuoteError: currentQuote.error,
      isInsufficientBalance,
      isAmountLessThanFee,
      hasInsufficientStellarGas,
      hasInsufficientEvmGas,
      isSameAssetSelected,
      actionType,
      crossChainWarning,
      activeQuoteData: currentQuote.data,
      feePayType,
      nativeSymbol,
    });
  }, [
    bridgeTxStatus,
    bridgeErrorMsg,
    swapError,
    currentQuote.error,
    isInsufficientBalance,
    isAmountLessThanFee,
    hasInsufficientStellarGas,
    hasInsufficientEvmGas,
    isSameAssetSelected,
    actionType,
    crossChainWarning,
    currentQuote.data,
    feePayType,
    nativeSymbol,
  ]);

  const buttonLabel = useMemo(() => {
    return getButtonLabel({
      isFetchingSwapAssets,
      isQuoteLoading,
      isFetchingStellarAssets,
      sellAmount,
      isSameAssetSelected,
      errorMessage,
      isInsufficientBalance,
      isAmountLessThanFee,
      hasInsufficientStellarGas,
      hasInsufficientEvmGas,
      toChainId,
      selectedBuyAsset,
      nativeSymbol,
      missingWallets,
      isStellarAccountActive,
    });
  }, [
    isFetchingSwapAssets,
    isQuoteLoading,
    isFetchingStellarAssets,
    sellAmount,
    isSameAssetSelected,
    errorMessage,
    isInsufficientBalance,
    isAmountLessThanFee,
    hasInsufficientStellarGas,
    hasInsufficientEvmGas,
    toChainId,
    selectedBuyAsset,
    nativeSymbol,
    missingWallets,
    isStellarAccountActive,
  ]);

  const isErrorState = useMemo(() => {
    if (
      isWalletMissing ||
      !sellAmount ||
      parseFloat(sellAmount) <= 0 ||
      isQuoteLoading ||
      isFetchingSwapAssets ||
      isFetchingStellarAssets
    ) {
      return false;
    }
    return !!(
      swapError ||
      isInsufficientBalance ||
      isAmountLessThanFee ||
      hasInsufficientStellarGas ||
      hasInsufficientEvmGas ||
      bridgeTxStatus === 'error' ||
      bridgeErrorMsg ||
      isSameAssetSelected ||
      (actionType === 'BRIDGE' && crossChainWarning) ||
      (currentQuote.error &&
        currentQuote.error !== 'Trustline required' &&
        currentQuote.error !== 'Account activation required')
    );
  }, [
    isWalletMissing,
    sellAmount,
    isQuoteLoading,
    isFetchingSwapAssets,
    isFetchingStellarAssets,
    swapError,
    isInsufficientBalance,
    isAmountLessThanFee,
    hasInsufficientStellarGas,
    hasInsufficientEvmGas,
    bridgeTxStatus,
    bridgeErrorMsg,
    isSameAssetSelected,
    actionType,
    crossChainWarning,
    currentQuote.error,
  ]);

  const isLoadingExecution = useMemo(() => {
    return ['preparing', 'signing'].includes(bridgeTxStatus);
  }, [bridgeTxStatus]);

  const calculatedBuyAmount = useMemo(() => {
    return getCalculatedBuyAmount({
      actionType,
      isGasless,
      showFusionScreen,
      selectedBuyAsset,
      activeQuoteSource: currentQuote.source,
      activeQuoteData: currentQuote.data,
      isSameAssetSelected,
      feePayType,
    });
  }, [
    actionType,
    isGasless,
    showFusionScreen,
    selectedBuyAsset,
    currentQuote.source,
    currentQuote.data,
    isSameAssetSelected,
    feePayType,
  ]);

  const conversionRate = useMemo(() => {
    return getConversionRate(sellAmount, calculatedBuyAmount);
  }, [sellAmount, calculatedBuyAmount]);

  const minimumReceived = useMemo(() => {
    return checkMinimumReceived({
      actionType,
      activeQuoteSource: currentQuote.source,
      activeQuoteData: currentQuote.data,
      feePayType,
      fromChainId,
      selectedBuyAsset,
      userSlippageTolerance,
      calculatedBuyAmount,
    });
  }, [
    actionType,
    currentQuote.source,
    currentQuote.data,
    feePayType,
    fromChainId,
    selectedBuyAsset,
    userSlippageTolerance,
    calculatedBuyAmount,
  ]);

  const isSwapDisabled = useMemo(() => {
    if (buttonLabel === 'ACTIVATE ACCOUNT' || buttonLabel === 'ADD TRUSTLINE') {
      return false;
    }

    if (isWalletMissing) {
      return isSameAssetSelected || isLoadingExecution;
    }

    return (
      !sellAmount ||
      parseFloat(sellAmount) <= 0 ||
      isInsufficientBalance ||
      isAmountLessThanFee ||
      hasInsufficientStellarGas ||
      hasInsufficientEvmGas ||
      isLoadingExecution ||
      !currentQuote.data ||
      isFetchingSwapAssets ||
      currentQuote.loading ||
      isQuoteLoading ||
      isSameAssetSelected
    );
  }, [
    buttonLabel,
    isWalletMissing,
    sellAmount,
    isInsufficientBalance,
    isAmountLessThanFee,
    hasInsufficientStellarGas,
    hasInsufficientEvmGas,
    isLoadingExecution,
    currentQuote.data,
    currentQuote.loading,
    isFetchingSwapAssets,
    isQuoteLoading,
    isSameAssetSelected,
  ]);

  return {
    isInsufficientBalance,
    isSameAssetSelected,
    isAmountLessThanFee,
    hasInsufficientStellarGas,
    hasInsufficientEvmGas,
    errorMessage,
    buttonLabel,
    isErrorState,
    isLoadingExecution,
    calculatedBuyAmount,
    conversionRate,
    minimumReceived,
    isSwapDisabled,
  };
}
