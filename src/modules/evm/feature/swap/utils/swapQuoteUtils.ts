import { ethers } from 'ethers';

import type {
  ButtonLabelParams,
  BuyAmountParams,
  ErrorParams,
  MinReceivedParams,
} from '../types/swap.types';
import { isStellar } from './swapAssetUtils';

export function getCalculatedBuyAmount(params: BuyAmountParams): string {
  const {
    actionType,
    isGasless,
    showFusionScreen,
    selectedBuyAsset,
    activeQuoteSource,
    activeQuoteData,
    isSameAssetSelected,
  } = params;

  if (isSameAssetSelected) return 'SELECT DIFFERENT PAIR';

  if (actionType === 'SWAP') {
    if (isGasless && activeQuoteSource === 'FUSION_PLUS' && showFusionScreen) {
      const decimals = selectedBuyAsset?.decimals || 18;
      return ethers.formatUnits(activeQuoteData.toTokenAmount || '0', decimals);
    }
    if (activeQuoteSource === 'STELLAR_SWAP') return activeQuoteData?.estimatedOutput || '0.00';
    return activeQuoteData?.outputAmount || '0.00';
  }

  // BRIDGE mode
  if (activeQuoteSource === 'FUSION_PLUS' && activeQuoteData) {
    const decimals = selectedBuyAsset?.decimals || 18;
    const amtRaw = activeQuoteData.toTokenAmount || activeQuoteData.dstTokenAmount || '0';
    try {
      return ethers.formatUnits(amtRaw, decimals);
    } catch {
      return '0.00';
    }
  }

  if (activeQuoteSource === 'NEAR_INTENT' && activeQuoteData) {
    if (activeQuoteData.amountOutFormatted) {
      return activeQuoteData.amountOutFormatted;
    }
    if (activeQuoteData.amountOut) {
      const decimals = selectedBuyAsset?.decimals || 6;
      try {
        return ethers.formatUnits(activeQuoteData.amountOut, decimals);
      } catch {
        return activeQuoteData.amountOut;
      }
    }
    return '0.00';
  }

  return '0.00';
}

export function getMinimumReceived(params: MinReceivedParams): string {
  const {
    actionType,
    activeQuoteSource,
    activeQuoteData,
    fromChainId,
    selectedBuyAsset,
    userSlippageTolerance,
    calculatedBuyAmount,
  } = params;

  if (actionType === 'BRIDGE') {
    if (activeQuoteSource === 'FUSION_PLUS' && activeQuoteData) {
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
    if (activeQuoteSource === 'NEAR_INTENT' && activeQuoteData) {
      if (activeQuoteData.minAmountOut) {
        try {
          return ethers.formatUnits(activeQuoteData.minAmountOut, selectedBuyAsset?.decimals || 18);
        } catch {
          return '0.00';
        }
      }
      return '0.00';
    }
  }

  if (isStellar(fromChainId) && activeQuoteSource === 'STELLAR_SWAP')
    return activeQuoteData?.minimumOutput || '0.00';

  if (activeQuoteData?.minimumReceived) return activeQuoteData.minimumReceived;
  if (!activeQuoteData?.outputAmount || !selectedBuyAsset) return '0.00';

  try {
    const decimals = selectedBuyAsset.decimals || 18;
    const amountBN = ethers.parseUnits(activeQuoteData.outputAmount, decimals);
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
    missingWallets,
    isStellarAccountActive,
  } = params;

  if (isSameAssetSelected) return 'SELECT DIFFERENT ASSET';

  if (missingWallets && missingWallets.length > 0) {
    if (missingWallets.length === 1) {
      const missing = String(missingWallets[0]).toLowerCase();
      if (missing === 'stellar') return 'CONNECT STELLAR WALLET';
      if (missing === 'evm') return 'CONNECT EVM WALLET';
      if (missing === 'cosmos') return 'CONNECT COSMOS WALLET';
      return `CONNECT ${String(missingWallets[0]).toUpperCase()} WALLET`;
    }
    return 'CONNECT WALLETS';
  }

  if (isFetchingSwapAssets || isQuoteLoading || isFetchingStellarAssets)
    return 'FETCHING QUOTES...';
  if (!sellAmount || parseFloat(sellAmount) <= 0) return 'ENTER AMOUNT';

  if (isInsufficientBalance) return 'INSUFFICIENT BALANCE';
  if (isAmountLessThanFee) return 'AMOUNT LESS THAN FEE';
  if (hasInsufficientStellarGas) return 'INSUFFICIENT XLM FOR FEE';
  if (hasInsufficientEvmGas) {
    return `INSUFFICIENT ${nativeSymbol} FOR GAS`;
  }

  if (
    isStellar(toChainId) &&
    isStellarAccountActive === false &&
    selectedBuyAsset &&
    selectedBuyAsset.symbol.toUpperCase() !== 'XLM'
  ) {
    return 'ACTIVATE ACCOUNT';
  }

  if (
    isStellar(toChainId) &&
    isStellarAccountActive !== false &&
    selectedBuyAsset &&
    !selectedBuyAsset.isNative &&
    !selectedBuyAsset.hasTrustline
  ) {
    return 'ADD TRUSTLINE';
  }

  if (errorMessage) {
    // Never show raw wallet error codes or overly long messages on the button
    const isRawCode = /^USER_REJECTED$|^ACTION_REJECTED$|^4001$/.test(errorMessage.trim());
    if (isRawCode) return 'SWAP FAILED';
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
    let reqFee = 0.00001; // Stellar base tx fee = 100 stroops
    if (actionType === 'BRIDGE' && feePayType === 'native' && activeQuoteData?.fee?.native) {
      reqFee += parseFloat(activeQuoteData.fee.native.amount);
    }
    return `Insufficient XLM balance. You need at least ${reqFee.toFixed(5)} XLM (beyond reserve) for network fees.`;
  }
  if (hasInsufficientEvmGas) {
    return `Insufficient ${nativeSymbol} balance for gas fees.`;
  }
  if (isSameAssetSelected) return 'Please select different assets to swap';
  if (actionType === 'BRIDGE' && crossChainWarning) return crossChainWarning;
  return null;
}
