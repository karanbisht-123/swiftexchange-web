import { ethers } from 'ethers';

import type { EvmGasCheckParams, StellarGasCheckParams } from '../types/swap.types';
import { getGasBuffer } from './swapAmountUtils';
import { isStellar } from './swapAssetUtils';

export function isInsufficientBalance(
  sellAmount: string,
  assetBalance: string | undefined
): boolean {
  if (!sellAmount || !assetBalance) return false;
  const requiredBalance = parseFloat(sellAmount);
  const currentBalance = parseFloat(assetBalance || '0');
  return requiredBalance > currentBalance;
}

export function isAmountLessThanFee(
  sellAmount: string,
  feeAmount: string,
  feePayType: string
): boolean {
  if (!sellAmount || !feeAmount) return false;
  if (feePayType === 'stablecoin') {
    const parsedFee = parseFloat(feeAmount);
    const parsedAmount = parseFloat(sellAmount);
    return parsedAmount <= parsedFee;
  }
  return false;
}

export function isInsufficientStellarGas(params: StellarGasCheckParams): boolean {
  const {
    fromChainId,
    stellarAssets,
    sellAssetSymbol,
    sellAmount,
    actionType,
    feePayType,
    activeQuoteData,
  } = params;
  if (!isStellar(fromChainId)) return false;
  if (stellarAssets.length === 0) return false;
  const xlm = stellarAssets.find(a => a.symbol === 'XLM');
  if (!xlm) return true;

  const xlmBalanceAfterReserve = parseFloat(xlm.balance || '0');

  // Dynamic fee estimation: Stellar network fee is very small (0.01 XLM)
  let requiredGasFee = 0.01;

  if (actionType === 'BRIDGE' && feePayType === 'native' && activeQuoteData?.fee?.native) {
    requiredGasFee += parseFloat(activeQuoteData.fee.native.amount);
  }

  if (sellAssetSymbol === 'XLM') {
    const sellAmt = parseFloat(sellAmount || '0');
    return sellAmt + requiredGasFee > xlmBalanceAfterReserve;
  } else {
    return xlmBalanceAfterReserve < requiredGasFee;
  }
}

export function isInsufficientEvmGas(params: EvmGasCheckParams): boolean {
  const {
    fromChainId,
    swapAssets,
    selectedSellAsset,
    sellAmount,
    actionType,
    feePayType,
    activeQuoteSource,
    activeQuoteData,
    swapQuoteNetworkFee,
    isGasless,
  } = params;

  if (isStellar(fromChainId)) return false;
  if (swapAssets.length === 0) return false;
  const nativeAsset = swapAssets.find(a => a.isNative);
  if (!nativeAsset) return false;

  const nativeBalance = parseFloat(nativeAsset.balance || '0');
  const decimals = nativeAsset.decimals || 18;

  // For gasless swap (like 1inch Fusion / Fusion Plus), network gas is 0 unless paying native bridge fee
  const isGaslessSwap = isGasless || activeQuoteSource === 'fusion_plus';
  let requiredGas = 0;

  if (!isGaslessSwap) {
    const gasBufferBN = getGasBuffer(fromChainId, decimals, swapQuoteNetworkFee);
    requiredGas = parseFloat(ethers.formatUnits(gasBufferBN, decimals));
  }

  // Use dynamic bridge quote fee if paying native
  if (actionType === 'BRIDGE' && feePayType === 'native' && activeQuoteData?.fee?.native) {
    requiredGas += parseFloat(activeQuoteData.fee.native.amount);
  }

  if (isGaslessSwap && requiredGas === 0) {
    return false;
  }

  if (selectedSellAsset?.isNative) {
    const sellAmt = parseFloat(sellAmount || '0');
    // Using a tiny epsilon check (1e-12) to avoid float rounding edge-cases
    return sellAmt + requiredGas > nativeBalance + 1e-12;
  } else {
    return nativeBalance < requiredGas;
  }
}
