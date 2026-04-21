import { fetchApiResponseFromProxy } from '../../../service/apiService';
import type { SwapQuote, SwapQuoteRequest } from '../../../types/evm/swap.types';
import { getChainById } from '../utils/Chainregistry';


const getChainSymbol = (chainId: number) =>
  getChainById(chainId)?.nativeCurrency.symbol?.toUpperCase() || 'ETH';

const getBridgeChainSymbol = (chainId: number) =>
  getChainSymbol(chainId).slice(0, 3);

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

const getSwapEndpoint = (action: 'quote' | 'prepare') =>
  action === 'quote' ? `/quoter/quote` : `/quoter/swap`;

function buildQuotePayload(request: any, chainId: any) {
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
    recipient: request.recipient || '',
    chainId: getChainSymbol(chainId),
  };
}

export async function getSwapQuote(chainId: number, request: SwapQuoteRequest): Promise<SwapQuote> {
  const payload = buildQuotePayload(request, chainId);
  const res = await fetchApiResponseFromProxy<any>(getSwapEndpoint('quote'), 'POST', payload);

  const quoteData = res.data?.data || res.data;
  if (!quoteData) throw new Error('No quote data received');

  return {
    inputAmount: quoteData.inputAmount || request.amount,
    inputToken: quoteData.inputToken || request.tokenIn.symbol,
    outputAmount: quoteData.outputAmount,
    outputToken: quoteData.outputToken || request.tokenOut.symbol,
    pricePerToken: quoteData.pricePerToken || '0',
    fee: typeof quoteData.fee === 'string' ? parseInt(quoteData.fee, 10) : quoteData.fee || 0,
    networkFee: quoteData.networkFee || 0,
    poolAddress: quoteData.poolAddress || '',
    priceImpact: quoteData.priceImpact || '0',
    rawQuote: quoteData,
  };
}

export async function prepareSwapTransaction(
  request: SwapTransactionRequest
): Promise<SwapTransactionData[]> {
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
    chainId: getChainSymbol(request.chainId)
  };

  const res = await fetchApiResponseFromProxy<any>(getSwapEndpoint('prepare'), 'POST', payload);

  const txData = res.data?.data || res.data;
  if (!txData) throw new Error('No transaction data received');

  return Array.isArray(txData) ? txData : [txData];
}

export async function getBridgeQuote(
  sourceChainId: number,
  destinationChainId: number,
  amount: string,
  sourceToken: string = 'usdt',
  destinationToken: string = 'usdt'
): Promise<any> {
  const res = await fetchApiResponseFromProxy<any>(`/bridge/swap-quotes`, 'POST', {
    amount,
    sourceChain: getBridgeChainSymbol(sourceChainId),
    destinationChain: getBridgeChainSymbol(destinationChainId),
    sourceToken: sourceToken.toUpperCase(),
    destinationToken: destinationToken.toUpperCase(),
  });

  return res.data;
}

export interface BridgeTransactionRequest {
  fromChainId: number;
  toChainId: number;
  amount: string;
  feePayType: 'stablecoin' | 'native';
  fromAddress: string;
  destinationAddress: string;
  sourceToken: string;
  destinationToken: string;
  slippageTolerance?: number;
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
  const res = await fetchApiResponseFromProxy<any>(`/bridge/swap-transaction/prepare`, 'POST', {
    sourceChain: getBridgeChainSymbol(request.fromChainId),
    destinationChain: getBridgeChainSymbol(request.toChainId),
    amount: request.amount,
    sourceToken: request.sourceToken.toUpperCase(),
    destinationToken: request.destinationToken.toUpperCase(),
    fromAddress: request.fromAddress,
    toAddress: request.destinationAddress,
    feePayType: request.feePayType,
    slippageTolerance: request.slippageTolerance || 0.5,
  });

  return res.data;
}