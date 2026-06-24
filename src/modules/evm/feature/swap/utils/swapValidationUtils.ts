import { ethers } from 'ethers';
import { isStellar } from './swapAssetUtils';
import { getGasBuffer } from './swapAmountUtils';
import type { StellarGasCheckParams, EvmGasCheckParams } from '../types/swap.types';

export function isInsufficientBalance(sellAmount: string, assetBalance: string | undefined): boolean {
  if (!sellAmount || !assetBalance) return false;
  const requiredBalance = parseFloat(sellAmount);
  const currentBalance = parseFloat(assetBalance || '0');
  return requiredBalance > currentBalance;
}

export function isAmountLessThanFee(sellAmount: string, feeAmount: string, feePayType: string): boolean {
  if (!sellAmount || !feeAmount) return false;
  if (feePayType === 'stablecoin') {
    const parsedFee = parseFloat(feeAmount);
    const parsedAmount = parseFloat(sellAmount);
    return parsedAmount <= parsedFee;
  }
  return false;
}

export function isInsufficientStellarGas(params: StellarGasCheckParams): boolean {
  const { fromChainId, stellarAssets, sellAssetSymbol, sellAmount, actionType, feePayType, activeQuoteData } = params;
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
    return (sellAmt + requiredGasFee) > xlmBalanceAfterReserve;
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

  // For gasless swap/bridge (like 1inch Fusion / Fusion Plus), required gas is 0
  if (isGasless || activeQuoteSource === 'fusion_plus') {
    return false;
  }

  // Default buffer if quote does not provide it
  const defaultBufferBN = getGasBuffer(fromChainId, decimals);
  const defaultBuffer = parseFloat(ethers.formatUnits(defaultBufferBN, decimals));

  let requiredGas = defaultBuffer;

  // Use dynamic swap quote network fee if available
  if (actionType === 'SWAP' && swapQuoteNetworkFee && swapQuoteNetworkFee > 0) {
    requiredGas = swapQuoteNetworkFee;
  }

  // Use dynamic bridge quote fee if paying native
  if (actionType === 'BRIDGE' && activeQuoteSource === 'bridge') {
    if (feePayType === 'native' && activeQuoteData?.fee?.native) {
      requiredGas = defaultBuffer + parseFloat(activeQuoteData.fee.native.amount);
    } else {
      requiredGas = defaultBuffer;
    }
  }

  if (selectedSellAsset?.isNative) {
    const sellAmt = parseFloat(sellAmount || '0');
    return (sellAmt + requiredGas) > nativeBalance;
  } else {
    return nativeBalance < requiredGas;
  }
}
