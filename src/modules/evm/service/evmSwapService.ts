import { fetchApiResponseFromProxy } from '../../../service/apiService';
import type { SwapQuote, SwapQuoteRequest } from '../../../types/evm/swap.types';

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


import { getChainById } from '../utils/Chainregistry';

const BSC_CHAIN_ID = 56;

function getBridgeChainSymbol(chainId: number): string {
  if (chainId === BSC_CHAIN_ID) return 'BNB';
  const chainConfig = getChainById(chainId);
  return chainConfig?.nativeCurrency.symbol || 'ETH';
}


function getSwapEndpoint(chainId: number, action: 'quote' | 'prepare'): string {
  const chainConfig = getChainById(chainId);
  const chainSymbol = chainConfig?.nativeCurrency.symbol.toLowerCase() || 'eth';

  if (action === 'quote') {
    return `/${chainSymbol}/swap-quote`;
  }
  return `/${chainSymbol}/swap-transaction/prepare`;
}

function buildQuotePayload(request: SwapQuoteRequest) {
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
  const payload = buildQuotePayload(request);

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

  const payload = {
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

  const res = await fetchApiResponseFromProxy<any>(endpoint, 'POST', payload);

  if (!res.data) throw new Error('No transaction data received');


  return Array.isArray(res.data) ? res.data : [res.data];
}

export async function getBridgeQuote(
  chainId: number,
  amount: string,
  sourceToken: string = 'usdt'
): Promise<any> {
  // const chainConfig = getChainById(chainId);
  // const chainSymbol = chainConfig?.nativeCurrency.symbol || 'ETH';
  const chainSymbol = getBridgeChainSymbol(chainId);
  const endpoint = `/bridge/swap-quotes`;
  const request = {
    amount,
    chainType: chainSymbol,
    sourceToken: sourceToken.toUpperCase(),
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
  chainId: number,
  request: BridgeTransactionRequest
): Promise<BridgeTransactionResponse> {
  // const chainConfig = getChainById(chainId);
  const chainSymbol = getBridgeChainSymbol(chainId);
  // const chainSymbol = chainConfig?.nativeCurrency.symbol || 'ETH';
  const endpoint = `/bridge/swap-transaction/prepare`;

  const payload = {
    fromAddress: request.fromAddress,
    toAddress: request.destinationAddress,
    amount: request.amount,
    sourceToken: request.sourceToken,
    destinationToken: request.destinationToken,
    walletType: chainSymbol,
    feePayType: request.feePayType,
  };

  const res = await fetchApiResponseFromProxy<any>(endpoint, 'POST', payload);


  return res.data;
}