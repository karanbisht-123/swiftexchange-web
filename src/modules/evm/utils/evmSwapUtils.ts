import { getSwapQuote } from '../feature/swap/services/evmSwapService';
import { get1InchFusionQuote } from '../feature/swap/services/fusionOrderService';
import type { SwapQuoteRequest, SwapQuote } from '../feature/swap/types/swap.types';
import type { TokenInfo } from '../service/tokenListService';
import { ethers } from 'ethers';
import { AGGREGATOR_NATIVE_ADDRESS } from '../feature/swap/constants/swap.constants';
import { parseSwapError } from '../feature/swap/utils/swapErrorHandler';
import { formatAmount } from '../feature/swap/utils/swapAmountUtils';

const isNativeAddress = (address: string | undefined | null): boolean => {
  if (!address) return true;
  const lowAddress = address.toLowerCase();
  return lowAddress === 'native' || lowAddress === '0x0000000000000000000000000000000000000000';
};

export { ensureFusionAllowance } from '../feature/swap/execution/approvalExecutor';
export { formatAmount } from '../feature/swap/utils/swapAmountUtils';
export { executeSwap } from '../feature/swap/execution/evmSwapExecutor';
export { execute1InchFusionSwap } from '../feature/swap/execution/fusionSwapExecutor';

export async function fetchEvmQuote(
  chainId: number | string,
  request: SwapQuoteRequest,
  selectedSellAsset: TokenInfo,
  selectedBuyAsset: TokenInfo,
  signal?: AbortSignal
): Promise<SwapQuote> {
  const isNativeSell = !!selectedSellAsset.isNative || isNativeAddress(request.tokenIn?.address) || isNativeAddress(selectedSellAsset.address);
  const isNativeBuy = !!selectedBuyAsset.isNative || isNativeAddress(request.tokenOut?.address) || isNativeAddress(selectedBuyAsset.address);
  const normalizedSellAddress = isNativeSell ? AGGREGATOR_NATIVE_ADDRESS.toLowerCase() : selectedSellAsset.address;
  const normalizedBuyAddress = isNativeBuy ? AGGREGATOR_NATIVE_ADDRESS.toLowerCase() : selectedBuyAsset.address;

  if (!isNativeSell && !ethers.isAddress(normalizedSellAddress || ''))
    throw new Error(`Invalid sell token address: ${selectedSellAsset.address}`);
  if (!isNativeBuy && !ethers.isAddress(normalizedBuyAddress || ''))
    throw new Error(`Invalid buy token address: ${selectedBuyAsset.address}`);

  const adjustedRequest: SwapQuoteRequest = {
    ...request,
    tokenIn: {
      ...selectedSellAsset,
      address: normalizedSellAddress,
      balance: selectedSellAsset.balance || '0',
      logoUri: selectedSellAsset.logoURI || null,
      chainId,
    },
    tokenOut: {
      ...selectedBuyAsset,
      address: normalizedBuyAddress,
      balance: selectedBuyAsset.balance || '0',
      logoUri: selectedBuyAsset.logoURI || null,
      chainId: selectedBuyAsset.chainId || chainId,
    },
  };

  const quote = await getSwapQuote(chainId, adjustedRequest, signal);
  return {
    ...quote,
    inputToken: selectedSellAsset.symbol,
    outputToken: selectedBuyAsset.symbol,
  };
}

export async function fetch1InchFusionQuote(
  chain: number | string,
  tokenIn: string,
  tokenOut: string,
  amount: string,
  walletAddress: string,
  decimals: number,
  toChain?: number | string,
  signal?: AbortSignal
): Promise<any> {
  try {
    const normalizedTokenIn = isNativeAddress(tokenIn) ? AGGREGATOR_NATIVE_ADDRESS.toLowerCase() : tokenIn;
    const normalizedTokenOut = isNativeAddress(tokenOut) ? AGGREGATOR_NATIVE_ADDRESS.toLowerCase() : tokenOut;

    return await get1InchFusionQuote(
      chain,
      {
        tokenIn: normalizedTokenIn,
        tokenOut: normalizedTokenOut,
        amount: formatAmount(amount, decimals),
        walletAddress,
      },
      toChain,
      signal
    );
  } catch (error: any) {
    throw new Error(parseSwapError(error));
  }
}
