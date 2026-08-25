import { fetchApiResponseFromProxy } from '../../../../../service/apiService';
import { getChainById } from '../../../utils/Chainregistry';
import { AGGREGATOR_NATIVE_ADDRESS } from '../constants/swap.constants';
import type { SwapQuote, SwapQuoteRequest } from '../types/swap.types';

const getChainSymbol = (chainId: number | string): string => {
  const chain = getChainById(chainId);
  const symbol = (chain?.symbol || chain?.nativeCurrency.symbol || '').toUpperCase();
  if (symbol === 'BNB') return 'BSC';
  return symbol;
};

const getBridgeChainSymbol = (chainId: number | string): string => {
  const symbol = getChainSymbol(chainId).toUpperCase();
  if (symbol === 'BNB') return 'BSC';
  return symbol.slice(0, 3);
};

export interface SwapTransactionRequest {
  chainId: number | string;
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
  gasPrice: string | undefined;
  to: string;
  from: string;
  data: string;
  value: string;
  chainId: number | string;
  nonce?: number;
  type?: number;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  gasLimit?: string;
  gas?: string;
}

export interface BridgeTransactionRequest {
  fromChainId: number | string;
  toChainId: number | string;
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

const getSwapEndpoint = (action: 'quote' | 'prepare'): string => {
  return action === 'quote' ? `/quoter/quote` : `/quoter/swap`;
};

function buildQuotePayload(request: SwapQuoteRequest, chainId: any): any {
  const slippageValue = request.slippage !== undefined ? parseFloat(request.slippage) : 1;
  return {
    ...request,
    tokenIn: {
      ...request.tokenIn,
      chainId: request.tokenIn.chainId || chainId,
    },
    tokenOut: {
      ...request.tokenOut,
      chainId: request.tokenOut.chainId || chainId,
    },
    recipient: request.recipient || '',
    slippage: slippageValue.toString(),
  };
}

export async function getSwapQuote(
  chainId: number | string,
  request: SwapQuoteRequest,
  signal?: AbortSignal
): Promise<SwapQuote> {
  const payload = buildQuotePayload(request, chainId);
  const res = await fetchApiResponseFromProxy<any>(
    getSwapEndpoint('quote'),
    'POST',
    payload,
    undefined,
    false,
    signal
  );

  if (!res.data || !res.data.success) {
    throw new Error(res.data?.message || 'Failed to fetch swap quote');
  }

  const { provider, data } = res.data;

  return {
    inputAmount: data.inputAmount || request.amount,
    inputToken: data.inputToken || request.tokenIn.symbol,
    outputAmount: data.outputAmount || '0',
    outputToken: data.outputToken || request.tokenOut.symbol,
    pricePerToken: data.pricePerToken || '0',
    fee: typeof data.fee === 'string' ? parseInt(data.fee, 10) : data.fee || 0,
    networkFee: data.networkFee || 0,
    poolAddress: data.poolAddress || '',
    priceImpact: data.priceImpact || '0',
    rawQuote: data,
    provider: provider || 'UNISWAP',
    minimumReceived: data.minimumReceived || undefined,
  };
}

export async function prepareSwapTransaction(
  request: SwapTransactionRequest
): Promise<SwapTransactionData[]> {
  const { chainId, tokenIn, tokenOut, amount } = request;

  const isNativeAddress = (address: string | undefined | null): boolean => {
    if (!address) return true;
    const lowAddress = address.toLowerCase();
    return lowAddress === 'native' || lowAddress === '0x0000000000000000000000000000000000000000';
  };

  const normalizedTokenInAddress = isNativeAddress(request.tokenIn.address)
    ? AGGREGATOR_NATIVE_ADDRESS.toLowerCase()
    : request.tokenIn.address;

  const normalizedTokenOutAddress = isNativeAddress(request.tokenOut.address)
    ? AGGREGATOR_NATIVE_ADDRESS.toLowerCase()
    : request.tokenOut.address;

  const payload = {
    amount,
    tokenIn: {
      ...tokenIn,
      address: normalizedTokenInAddress,
    },
    tokenOut: {
      ...tokenOut,
      address: normalizedTokenOutAddress,
    },
    recipient: request.senderAddress,
    chainId: getChainSymbol(chainId),
  };

  const res = await fetchApiResponseFromProxy<any>(getSwapEndpoint('prepare'), 'POST', payload);
  const txData = res.data?.data || res.data;

  if (!txData) {
    throw new Error('No transaction data received');
  }

  return Array.isArray(txData) ? txData : [txData];
}

export async function getBridgeQuote(
  sourceChainId: number | string,
  destinationChainId: number | string,
  amount: string,
  sourceToken: string,
  destinationToken: string
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

export async function prepareBridgeTransaction(
  request: BridgeTransactionRequest
): Promise<BridgeTransactionResponse> {
  const res = await fetchApiResponseFromProxy<any>(`/bridge/swap-transaction/prepare`, 'POST', {
    walletType: getBridgeChainSymbol(request.fromChainId),
    destinationWalletType: getBridgeChainSymbol(request.toChainId),
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
