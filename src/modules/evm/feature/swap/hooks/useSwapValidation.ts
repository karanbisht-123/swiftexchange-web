import { useMemo } from 'react';

import { isSameAsset as checkSameAsset, isStellar } from '../utils/swapAssetUtils';
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
  selectedSellAsset: any;
  selectedBuyAsset: any;
  actionType: 'SWAP' | 'BRIDGE';
  feePayType: 'native' | 'stablecoin';
  fromChainId: number | string;
  toChainId: number | string;
  stellarAssets: any[];
  swapAssets: any[];
  activeQuote: any;
  swapQuote: any;
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
  fusionQuote: any;
  missingWallets?: string[];
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
    activeQuote,
    swapQuote,
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
    fusionQuote,
    missingWallets,
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
    if (actionType !== 'BRIDGE' || !sellAmount || !activeQuote.data) return false;
    const feeAmount = activeQuote.data.fee?.stablecoin?.amount || '0';
    return checkAmountLessThanFee(sellAmount, feeAmount, feePayType);
  }, [actionType, sellAmount, activeQuote.data, feePayType]);

  const hasInsufficientStellarGas = useMemo(() => {
    if (isWalletMissing) return false;
    // Only check gas if a quote has fetched and we aren't quote loading
    const hasQuote = !!activeQuote.data;
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
      activeQuoteData: activeQuote.data,
    });
  }, [
    fromChainId,
    stellarAssets,
    selectedSellAsset,
    sellAmount,
    actionType,
    feePayType,
    activeQuote.data,
    isQuoteLoading,
    isFetchingStellarAssets,
    isWalletMissing,
  ]);

  const hasInsufficientEvmGas = useMemo(() => {
    if (isWalletMissing) return false;
    // Only check gas if a quote has fetched (either swap or bridge) and we aren't quote loading
    const hasQuote =
      actionType === 'SWAP' ? (isGasless ? !!fusionQuote : !!swapQuote) : !!activeQuote.data;

    if (isQuoteLoading || isFetchingSwapAssets || !hasQuote) {
      return false;
    }
    return checkInsufficientEvmGas({
      fromChainId,
      swapAssets,
      selectedSellAsset,
      sellAmount,
      actionType,
      feePayType,
      activeQuoteSource: activeQuote.source,
      activeQuoteData: activeQuote.data,
      swapQuoteNetworkFee: swapQuote?.networkFee,
      isGasless,
    });
  }, [
    fromChainId,
    swapAssets,
    selectedSellAsset,
    sellAmount,
    actionType,
    feePayType,
    activeQuote.source,
    activeQuote.data,
    swapQuote?.networkFee,
    isGasless,
    isQuoteLoading,
    isFetchingSwapAssets,
    fusionQuote,
    swapQuote,
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
      activeQuoteError: activeQuote.error,
      isInsufficientBalance,
      isAmountLessThanFee,
      hasInsufficientStellarGas,
      hasInsufficientEvmGas,
      isSameAssetSelected,
      actionType,
      crossChainWarning,
      activeQuoteData: activeQuote.data,
      feePayType,
      nativeSymbol,
    });
  }, [
    bridgeTxStatus,
    bridgeErrorMsg,
    swapError,
    activeQuote.error,
    isInsufficientBalance,
    isAmountLessThanFee,
    hasInsufficientStellarGas,
    hasInsufficientEvmGas,
    isSameAssetSelected,
    actionType,
    crossChainWarning,
    activeQuote.data,
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
  ]);

  const isErrorState = useMemo(() => {
    // Do not show error state (red button/warnings) if amount is not entered, if disconnected, or if we are actively fetching quotes
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
      activeQuote.error
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
    activeQuote.error,
  ]);

  const isLoadingExecution = useMemo(() => {
    return ['preparing', 'signing'].includes(bridgeTxStatus);
  }, [bridgeTxStatus]);

  const calculatedBuyAmount = useMemo(() => {
    return getCalculatedBuyAmount({
      actionType,
      isGasless,
      fusionQuote,
      showFusionScreen,
      selectedBuyAsset,
      activeQuoteSource: activeQuote.source,
      activeQuoteData: activeQuote.data,
      swapQuote,
      isSameAssetSelected,
      feePayType,
    });
  }, [
    actionType,
    isGasless,
    fusionQuote,
    showFusionScreen,
    selectedBuyAsset,
    activeQuote.source,
    activeQuote.data,
    swapQuote,
    isSameAssetSelected,
    feePayType,
  ]);

  const conversionRate = useMemo(() => {
    return getConversionRate(sellAmount, calculatedBuyAmount);
  }, [sellAmount, calculatedBuyAmount]);

  const minimumReceived = useMemo(() => {
    return checkMinimumReceived({
      actionType,
      activeQuoteSource: activeQuote.source,
      activeQuoteData: activeQuote.data,
      feePayType,
      fromChainId,
      swapQuote,
      selectedBuyAsset,
      userSlippageTolerance,
      calculatedBuyAmount,
    });
  }, [
    actionType,
    activeQuote.source,
    activeQuote.data,
    feePayType,
    fromChainId,
    swapQuote,
    selectedBuyAsset,
    userSlippageTolerance,
    calculatedBuyAmount,
  ]);

  const isSwapDisabled = useMemo(() => {
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
      (actionType === 'SWAP' && isStellar(fromChainId) && !activeQuote.data) ||
      (actionType === 'SWAP' && !isStellar(fromChainId) && !swapQuote && !isGasless) ||
      (actionType === 'BRIDGE' && !activeQuote.data && !activeQuote.loading) ||
      isFetchingSwapAssets ||
      activeQuote.loading ||
      isQuoteLoading ||
      isSameAssetSelected
    );
  }, [
    isWalletMissing,
    sellAmount,
    isInsufficientBalance,
    isAmountLessThanFee,
    hasInsufficientStellarGas,
    hasInsufficientEvmGas,
    isLoadingExecution,
    actionType,
    fromChainId,
    activeQuote.data,
    activeQuote.loading,
    swapQuote,
    isGasless,
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
