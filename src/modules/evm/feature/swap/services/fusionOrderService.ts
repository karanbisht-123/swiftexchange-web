import { fetchApiResponseFromProxy } from '../../../../../service/apiService';
import { getChainById } from '../../../utils/Chainregistry';
import type { BuildFusionOrderRequest } from '../types/swap.types';

/**
 * Resolves the chain symbol used by 1inch APIs.
 * BNB Smart Chain is referenced as 'BSC' in the 1inch API.
 */
const getChainSymbol = (chainId: number | string): string => {
  const chain = getChainById(chainId);
  const symbol = (chain?.symbol || chain?.nativeCurrency.symbol || '').toUpperCase();
  return symbol === 'BNB' ? 'BSC' : symbol;
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

  const payload: Record<string, unknown> = isCrossChain
    ? {
        srcChain: getChainSymbol(chainId),
        dstChain: getChainSymbol(toChainId!),
        srcTokenAddress: request.tokenIn,
        dstTokenAddress: request.tokenOut,
        walletAddress: request.walletAddress,
        amount: request.amount,
      }
    : {
        ...request,
        chain: getChainSymbol(chainId),
      };

  const res = await fetchApiResponseFromProxy<any>(
    endpoint,
    'POST',
    payload,
    undefined,
    false,
    signal
  );
  const data = res.data?.data || res.data;

  if (!data) throw new Error('No 1inch quote data received');
  return data;
}

export async function build1InchFusionOrder(
  request: BuildFusionOrderRequest & { isNative?: boolean }
): Promise<any> {
  const isCrossChain = !!request.toChain;

  let endpoint: string;
  if (request.isNative) {
    endpoint = `/swap/1inch/buildFusionPlusNativeOrder`;
  } else if (isCrossChain) {
    endpoint = `/swap/1inch/buildFusionPlusOrder`;
  } else {
    endpoint = `/swap/1inch/buildFusionOrder`;
  }

  const quoteId: string | undefined =
    request.quote?.quoteId ?? (request.quote as any)?.data?.quoteId ?? (request as any).quoteId;

  if (isCrossChain && !quoteId) {
    throw new Error('quoteId missing for Fusion+ cross-chain order. Cannot build order.');
  }

  let payload: Record<string, unknown>;

  if (request.isNative) {
    payload = {
      srcChain: request.chain,
      dstChain: request.toChain ?? request.chain,
      amount: request.amount,
      srcTokenAddress: request.tokenIn,
      dstTokenAddress: request.tokenOut,
      walletAddress: request.walletAddress,
    };
  } else if (isCrossChain) {
    payload = {
      quoteId,
      walletAddress: request.walletAddress,
      secretCount: request.secretCount ?? 1,
    };
  } else {
    payload = { ...request } as Record<string, unknown>;
  }

  const res = await fetchApiResponseFromProxy<any>(endpoint, 'POST', payload);
  const data = res.data?.data || res.data;

  if (!data) throw new Error('Failed to build 1inch Fusion order');
  return data;
}

export async function submit1InchFusionOrder(
  request: any,
  isCrossChain?: boolean,
  isNative?: boolean
): Promise<any> {
  let endpoint: string;
  if (isNative) {
    endpoint = `/swap/1inch/submitFusionPlusNativeOrder`;
  } else if (isCrossChain) {
    endpoint = `/swap/1inch/submitFusionPlusOrder`;
  } else {
    endpoint = `/swap/1inch/submitOrder`;
  }

  const res = await fetchApiResponseFromProxy<any>(endpoint, 'POST', request);
  const data = res.data?.data || res.data;

  if (!data) throw new Error('Failed to submit 1inch Fusion order');
  return data;
}
