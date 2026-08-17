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

  // Use the actual network fee from the quote if available.
  // Stellar base tx fee = 100 stroops = 0.00001 XLM.
  // During congestion the fee can be higher — the quote provider returns the
  // real fee so we always prefer that over any static fallback.
  const STELLAR_BASE_FEE = 0.00001; // 100 stroops
  let requiredGasFee: number;

  if (activeQuoteData?.networkFee !== undefined && activeQuoteData.networkFee !== null) {
    // Quote returned a real fee — trust it
    requiredGasFee = parseFloat(String(activeQuoteData.networkFee));
    if (isNaN(requiredGasFee) || requiredGasFee <= 0) requiredGasFee = STELLAR_BASE_FEE;
  } else {
    // No live fee — fall back to the protocol minimum
    requiredGasFee = STELLAR_BASE_FEE;
  }

  // For bridge with native fee payment, add the bridge protocol fee on top
  if (actionType === 'BRIDGE' && feePayType === 'native' && activeQuoteData?.fee?.native) {
    requiredGasFee += parseFloat(activeQuoteData.fee.native.amount);
  }

  if (sellAssetSymbol === 'XLM') {
    const sellAmt = parseFloat(sellAmount || '0');
    // Small epsilon to absorb floating-point rounding at the boundary
    return sellAmt + requiredGasFee > xlmBalanceAfterReserve + 1e-9;
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
