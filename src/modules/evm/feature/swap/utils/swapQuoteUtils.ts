import { ethers } from 'ethers';

import type {
  ButtonLabelParams,
  BuyAmountParams,
  ErrorParams,
  MinReceivedParams,
} from '../types/swap.types';
import { toPlainString } from './swapAmountUtils';
import { isStellar } from './swapAssetUtils';

export function getCalculatedBuyAmount(params: BuyAmountParams): string {
  const {
    actionType,
    isGasless,
    fusionQuote,
    showFusionScreen,
    selectedBuyAsset,
    activeQuoteSource,
    activeQuoteData,
    swapQuote,
    isSameAssetSelected,
    feePayType,
  } = params;

  if (isSameAssetSelected) return 'SELECT DIFFERENT PAIR';

  if (actionType === 'SWAP') {
    if (isGasless && fusionQuote && showFusionScreen) {
      const decimals = selectedBuyAsset?.decimals || 18;
      return ethers.formatUnits(fusionQuote.toTokenAmount, decimals);
    }
    if (activeQuoteSource === 'stellar') return activeQuoteData?.estimatedOutput || '0.00';
    return swapQuote?.outputAmount || '0.00';
  }

  // BRIDGE mode
  if (activeQuoteSource === 'bridge') {
    const grossAmount = parseFloat(activeQuoteData?.minimumAmountOut || '0');
    if (feePayType === 'stablecoin' && activeQuoteData?.fee?.stablecoin) {
      const feeAmount = parseFloat(activeQuoteData.fee.stablecoin.amount || '0');
      const netAmount = Math.max(0, grossAmount - feeAmount);
      return toPlainString(netAmount);
    }
    return activeQuoteData?.minimumAmountOut || '0.00';
  }
  if (activeQuoteSource === 'fusion_plus' && activeQuoteData) {
    const decimals = selectedBuyAsset?.decimals || 18;
    const amtRaw = activeQuoteData.toTokenAmount || activeQuoteData.dstTokenAmount || '0';
    try {
      return ethers.formatUnits(amtRaw, decimals);
    } catch {
      return '0.00';
    }
  }
  if (activeQuoteSource === 'near_intent' && activeQuoteData) {
    return activeQuoteData.amountOutFormatted || activeQuoteData.amountOut || '0.00';
  }
  if (swapQuote) return swapQuote.outputAmount || '0.00';

  return '0.00';
}

export function getMinimumReceived(params: MinReceivedParams): string {
  const {
    actionType,
    activeQuoteSource,
    activeQuoteData,
    feePayType,
    fromChainId,
    swapQuote,
    selectedBuyAsset,
    userSlippageTolerance,
    calculatedBuyAmount,
  } = params;

  if (actionType === 'BRIDGE') {
    if (activeQuoteSource === 'fusion_plus' && activeQuoteData) {
      const q = activeQuoteData;
      const preset = (q.recommended_preset || 'fast') as 'fast' | 'medium' | 'slow';
      const presetData = q.presets?.[preset];
      if (presetData) {
        const decimals = selectedBuyAsset?.decimals || 18;
        try {
          return ethers.formatUnits(presetData.auctionEndAmount, decimals);
        } catch {
          return '0.00';
        }
      }
    }
    if (activeQuoteSource === 'near_intent' && activeQuoteData) {
      if (activeQuoteData.minAmountOut) {
        try {
          return ethers.formatUnits(activeQuoteData.minAmountOut, selectedBuyAsset?.decimals || 18);
        } catch {
          return '0.00';
        }
      }
      return '0.00';
    }
    if (activeQuoteSource === 'bridge') {
      const grossAmount = parseFloat(activeQuoteData?.minimumAmountOut || '0');
      if (feePayType === 'stablecoin' && activeQuoteData?.fee?.stablecoin) {
        const feeAmount = parseFloat(activeQuoteData.fee.stablecoin.amount || '0');
        return Math.max(0, grossAmount - feeAmount).toString();
      }
      return activeQuoteData?.minimumAmountOut || '0.00';
    }
  }

  if (isStellar(fromChainId) && activeQuoteSource === 'stellar')
    return activeQuoteData?.minimumOutput || '0.00';

  if (swapQuote?.minimumReceived) return swapQuote.minimumReceived;
  if (!swapQuote?.outputAmount || !selectedBuyAsset) return '0.00';

  try {
    const decimals = selectedBuyAsset.decimals || 18;
    const amountBN = ethers.parseUnits(swapQuote.outputAmount, decimals);
    const slippageBips = BigInt(Math.floor(userSlippageTolerance * 100));
    const minReceivedBN = (amountBN * (10000n - slippageBips)) / 10000n;
    return ethers.formatUnits(minReceivedBN, decimals);
  } catch {
    return calculatedBuyAmount;
  }
}

export function getConversionRate(sellAmount: string, buyAmount: string): string {
  const sellAmt = parseFloat(sellAmount);
  const buyAmt = parseFloat(buyAmount);
  if (isNaN(sellAmt) || sellAmt <= 0 || isNaN(buyAmt) || buyAmt <= 0) return '0.00';
  return (buyAmt / sellAmt).toFixed(6);
}

export function getButtonLabel(params: ButtonLabelParams): string {
  const {
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
  } = params;

  if (isFetchingSwapAssets || isQuoteLoading || isFetchingStellarAssets)
    return 'FETCHING QUOTES...';
  if (!sellAmount || parseFloat(sellAmount) <= 0) return 'ENTER AMOUNT';
  if (isSameAssetSelected) return 'SELECT DIFFERENT ASSET';

  if (isInsufficientBalance) return 'INSUFFICIENT BALANCE';
  if (isAmountLessThanFee) return 'AMOUNT LESS THAN FEE';
  if (hasInsufficientStellarGas) return 'INSUFFICIENT XLM FOR FEE';
  if (hasInsufficientEvmGas) {
    return `INSUFFICIENT ${nativeSymbol} FOR GAS`;
  }

  if (
    isStellar(toChainId) &&
    selectedBuyAsset &&
    !selectedBuyAsset.isNative &&
    !selectedBuyAsset.hasTrustline
  ) {
    return 'ADD TRUSTLINE & SWAP';
  }

  if (errorMessage) {
    return errorMessage.length > 45 ? 'SWAP FAILED' : errorMessage.toUpperCase();
  }

  return 'SWAP';
}

export function getErrorMessage(params: ErrorParams): string | null {
  const {
    bridgeTxStatus,
    bridgeErrorMsg,
    swapError,
    activeQuoteError,
    isInsufficientBalance,
    isAmountLessThanFee,
    hasInsufficientStellarGas,
    hasInsufficientEvmGas,
    isSameAssetSelected,
    actionType,
    crossChainWarning,
    activeQuoteData,
    feePayType,
    nativeSymbol,
  } = params;

  if (bridgeTxStatus === 'error' || bridgeErrorMsg)
    return bridgeErrorMsg || 'Transaction failed. Please try again.';
  if (swapError) return swapError;
  if (activeQuoteError) return activeQuoteError;
  if (isInsufficientBalance) return 'Insufficient balance for this transaction';
  if (isAmountLessThanFee) {
    const feeAmount = parseFloat(activeQuoteData?.fee?.stablecoin?.amount || '0');
    return `Amount must be greater than the bridge fee of ${feeAmount.toFixed(4)} USDC`;
  }
  if (hasInsufficientStellarGas) {
    let reqFee = 0.01;
    if (actionType === 'BRIDGE' && feePayType === 'native' && activeQuoteData?.fee?.native) {
      reqFee += parseFloat(activeQuoteData.fee.native.amount);
    }
    return `Insufficient XLM balance. You need at least ${reqFee.toFixed(3)} XLM (beyond reserve) for gas fees.`;
  }
  if (hasInsufficientEvmGas) {
    return `Insufficient ${nativeSymbol} balance for gas fees.`;
  }
  if (isSameAssetSelected) return 'Please select different assets to swap';
  if (actionType === 'BRIDGE' && crossChainWarning) return crossChainWarning;
  return null;
}
