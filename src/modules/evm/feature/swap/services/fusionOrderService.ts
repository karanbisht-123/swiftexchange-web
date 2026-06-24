import { fetchApiResponseFromProxy } from '../../../../../service/apiService';
import type { BuildFusionOrderRequest } from '../types/swap.types';
import { getChainById } from '../../../utils/Chainregistry';

const getChainSymbol = (chainId: number | string): string => {
  const chain = getChainById(chainId);
  const symbol = (chain?.symbol || chain?.nativeCurrency.symbol || '').toUpperCase();
  if (symbol === 'BNB') return 'BSC';
  return symbol;
};

export async function get1InchFusionQuote(
  chainId: number | string,
  request: {
    tokenIn: string;
    tokenOut: string;
    amount: string;
    walletAddress: string;
    decimals?: number;
  },
  toChainId?: number | string,
  signal?: AbortSignal
): Promise<any> {
  const isCrossChain = toChainId && String(chainId) !== String(toChainId);
  const endpoint = isCrossChain
    ? `/swap/1inch/fusion-plus/getSwapQuote`
    : `/swap/1inch/getSwapQuote`;

  let payload: any;
  if (isCrossChain) {
    payload = {
      srcChain: getChainSymbol(chainId),
      dstChain: getChainSymbol(toChainId),
      srcTokenAddress: request.tokenIn,
      dstTokenAddress: request.tokenOut,
      walletAddress: request.walletAddress,
      amount: request.amount,
    };
  } else {
    payload = {
      ...request,
      chain: getChainSymbol(chainId),
      amount: request.amount,
      walletAddress: request.walletAddress,
    };
  }

  const res = await fetchApiResponseFromProxy<any>(
    endpoint,
    'POST',
    payload,
    undefined,
    false,
    signal
  );

  const data = res.data?.data || res.data;

  if (!data) {
    throw new Error('No 1inch quote data received');
  }

  return data;
}

export async function build1InchFusionOrder(
  request: BuildFusionOrderRequest & { isNative?: boolean }
): Promise<any> {
  const isCrossChain = !!request.toChain;
  let endpoint = isCrossChain ? `/swap/1inch/buildFusionPlusOrder` : `/swap/1inch/buildFusionOrder`;

  if (request.isNative) {
    endpoint = `/swap/1inch/buildFusionPlusNativeOrder`;
  }

  let payload: any = request;
  if (request.isNative) {
    payload = {
      srcChain: request.chain,
      dstChain: request.toChain || request.chain,
      amount: request.amount,
      srcTokenAddress: request.tokenIn,
      dstTokenAddress: request.tokenOut,
      walletAddress: request.walletAddress,
    };
  } else if (isCrossChain) {
    payload = {
      quoteId: request.quote.quoteId,
      walletAddress: request.walletAddress,
      secretCount: request.secretCount,
    };
  }

  const res = await fetchApiResponseFromProxy<any>(endpoint, 'POST', payload);
  const data = res.data?.data || res.data;

  if (!data) {
    throw new Error('Failed to build 1inch Fusion order');
  }

  return data;
}

export async function submit1InchFusionOrder(
  request: any,
  isCrossChain?: boolean,
  isNative?: boolean
): Promise<any> {
  let endpoint = isCrossChain ? `/swap/1inch/submitFusionPlusOrder` : `/swap/1inch/submitOrder`;

  if (isNative) {
    endpoint = `/swap/1inch/submitFusionPlusNativeOrder`;
  }

  const res = await fetchApiResponseFromProxy<any>(endpoint, 'POST', request);
  const data = res.data?.data || res.data;

  if (!data) {
    throw new Error('Failed to submit 1inch Fusion order');
  }

  return data;
}
