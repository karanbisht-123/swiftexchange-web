import { fetchApiResponseFromProxy } from '../../../service/apiService';
import type { SwapQuote, SwapQuoteRequest } from '../../../types/evm/swap.types';
import { useWalletStore } from '../../walletconnect/store/walletConnectStore';

interface SwapTransactionRequest {
  chainId: number;
  quote: SwapQuote;
  tokenIn: {
    address: string;
    symbol: string;
    decimals: number;
    isNative?: boolean;
  };
  tokenOut: {
    address: string;
    symbol: string;
    decimals: number;
    isNative?: boolean;
  };
  senderAddress: string;
  amount: string;
  slippageTolerance: number;
}

export interface SwapTransactionData {
  to: string;
  from: string;
  data: string;
  value: string;
  chainId: number;
  nonce?: number;
  type?: number;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  gasLimit?: string;
  gas?: string;
}

function isMainnet(): boolean {
  return useWalletStore.getState().network === 'mainnet';
}

function getSwapEndpoint(chainId: number, action: 'quote' | 'prepare'): string {
  if (!isMainnet()) {
    return action === 'quote' ? '/swap-quote' : '/swap-execute';
  }

  const isBSC = chainId === 56 || chainId === 97;
  const chain = isBSC ? 'bsc' : 'eth';

  if (action === 'quote') {
    return `/${chain}/swap-quote`;
  }
  return `/${chain}/swap-transaction/prepare`;
}

function buildQuotePayload(request: SwapQuoteRequest, chainId: number) {
  if (!isMainnet()) {
    return {
      chainId,
      ...request,
    };
  }

  return {
    tokenIn: {
      address: request.tokenIn.address,
      symbol: request.tokenIn.symbol,
      name: request.tokenIn.name,
      decimals: request.tokenIn.decimals,
    },
    tokenOut: {
      address: request.tokenOut.address,
      symbol: request.tokenOut.symbol,
      name: request.tokenOut.name,
      decimals: request.tokenOut.decimals,
    },
    amount: request.amount,
  };
}

export async function getSwapQuote(chainId: number, request: SwapQuoteRequest): Promise<SwapQuote> {
  console.log('[SwapService] Fetching quote, network:', isMainnet() ? 'mainnet' : 'testnet');

  const endpoint = getSwapEndpoint(chainId, 'quote');
  const payload = buildQuotePayload(request, chainId);

  console.log('[SwapService] Endpoint:', endpoint);
  console.log('[SwapService] Payload:', JSON.stringify(payload, null, 2));

  const res = await fetchApiResponseFromProxy<any>(endpoint, 'POST', payload);

  return {
    inputAmount: res.data.inputAmount || request.amount,
    inputToken: res.data.inputToken || request.tokenIn.symbol,
    outputAmount: res.data.outputAmount,
    outputToken: res.data.outputToken || request.tokenOut.symbol,
    pricePerToken: res.data.pricePerToken || '0',
    fee: typeof res.data.fee === 'string' ? parseInt(res.data.fee, 10) : res.data.fee || 0,
    poolAddress: res.data.poolAddress || '',
    priceImpact: res.data.priceImpact || '0',
    rawQuote: res.data,
  };
}

export async function prepareSwapTransaction(
  request: SwapTransactionRequest
): Promise<SwapTransactionData[]> {
  console.log('[SwapService] Prepare swap tx, network:', isMainnet() ? 'mainnet' : 'testnet');

  const endpoint = getSwapEndpoint(request.chainId, 'prepare');

  let payload: any;

  if (isMainnet()) {
    payload = {
      tokenIn: {
        address: request.tokenIn.address,
        symbol: request.tokenIn.symbol,
        name: request.tokenIn.symbol,
        decimals: request.tokenIn.decimals,
      },
      tokenOut: {
        address: request.tokenOut.address,
        symbol: request.tokenOut.symbol,
        name: request.tokenOut.symbol,
        decimals: request.tokenOut.decimals,
      },
      amount: request.amount,
      recipient: request.senderAddress,
    };
  } else {
    payload = request;
  }

  console.log('[SwapService] Prepare payload:', JSON.stringify(payload, null, 2));

  const res = await fetchApiResponseFromProxy<any>(endpoint, 'POST', payload);

  const transactions: SwapTransactionData[] = Array.isArray(res.data) ? res.data : [res.data];

  console.log('[SwapService] Prepared transactions:', transactions.length);

  return transactions;
}

export async function getBridgeQuote(amount: string, chainType: string): Promise<any> {
  const endpoint = '/bridge/swap-quotes';

  const request = {
    amount,
    chainType,
  };

  const res = await fetchApiResponseFromProxy<any>(endpoint, 'POST', request);
  return res.data;
}
