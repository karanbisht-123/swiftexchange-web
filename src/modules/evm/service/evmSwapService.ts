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
  const endpoint = getSwapEndpoint(chainId, 'quote');
  const payload = buildQuotePayload(request, chainId);

  const res = await fetchApiResponseFromProxy<any>(endpoint, 'POST', payload);

  if (!res.data) throw new Error('No quote data received');

  return {
    inputAmount: res.data.inputAmount || request.amount,
    inputToken: res.data.inputToken || request.tokenIn.symbol,
    outputAmount: res.data.outputAmount,
    outputToken: res.data.outputToken || request.tokenOut.symbol,
    pricePerToken: res.data.pricePerToken || '0',
    fee: typeof res.data.fee === 'string' ? parseInt(res.data.fee, 10) : res.data.fee || 0,
    networkFee: res.data.networkFee || 0,
    poolAddress: res.data.poolAddress || '',
    priceImpact: res.data.priceImpact || '0',
    rawQuote: res.data,
  };
}

export async function prepareSwapTransaction(
  request: SwapTransactionRequest
): Promise<SwapTransactionData[]> {
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

  const res = await fetchApiResponseFromProxy<any>(endpoint, 'POST', payload);

  if (!res.data) throw new Error('No transaction data received');

  return Array.isArray(res.data) ? res.data : [res.data];
}

export async function getBridgeQuote(
  amount: string,
  chainType: string,
  sourceToken: string = 'usdt'
): Promise<any> {
  const endpoint = '/bridge/swap-quotes';

  const request = {
    amount,
    chainType,
    sourceToken,
  };

  const res = await fetchApiResponseFromProxy<any>(endpoint, 'POST', request);
  return res.data;
}

export interface BridgeTransactionRequest {
  amount: string;
  feePayType: 'stablecoin' | 'native';
  fromAddress: string;
  destinationAddress: string;
  sourceToken: string;
  destinationToken: string;
  walletType: any;
}

export interface BridgeTxData {
  from: string;
  to: string;
  value: string;
  data: string;
}

export interface BridgeTxMeta {
  nonce: number;
  gasLimit: string;
  feeData: {
    _type: string;
    gasPrice: string;
    maxFeePerGas: string | null;
    maxPriorityFeePerGas: string | null;
  };
  network: {
    name: string;
    chainId: string;
  };
}

export interface BridgeTransaction {
  transaction: BridgeTxData;
  txMeta: BridgeTxMeta;
  type: 'approve' | 'transfer';
}

export interface BridgeTransactionResponse {
  needsApproval: boolean;
  transactions: BridgeTransaction[];
}

export async function prepareBridgeTransaction(
  request: BridgeTransactionRequest
): Promise<BridgeTransactionResponse> {
  console.log('[BridgeService] Preparing bridge transaction:', JSON.stringify(request, null, 2));
  const endpoint = `/bridge/swap-transaction/prepare`;

  const payload = {
    fromAddress: request.fromAddress,
    toAddress: request.destinationAddress,
    amount: request.amount,
    sourceToken: request.sourceToken,
    destinationToken: request.destinationToken,
    walletType: request.walletType,
    feePayType: request.feePayType,
  };

  console.log('[BridgeService] Endpoint:', endpoint);
  console.log('[BridgeService] Prepare payload:', JSON.stringify(payload, null, 2));

  const res = await fetchApiResponseFromProxy<any>(endpoint, 'POST', payload);

  console.log('[BridgeService] Bridge transaction response:', res.data);

  return res.data;
}
