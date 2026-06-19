import { fetchApiResponseFromProxy } from '../../../service/apiService';
import type {
  BuildFusionOrderRequest,
  SwapQuote,
  SwapQuoteRequest,
} from '../../../types/evm/swap.types';
import { getChainById } from '../utils/Chainregistry';
import { AGGREGATOR_NATIVE_ADDRESS, NATIVE_ADDRESS } from '../utils/assetmanagement/constants';

const isNativeAddress = (address: string | undefined | null): boolean => {
  if (!address) return true;
  const lowAddress = address.toLowerCase();
  return lowAddress === 'native' || lowAddress === NATIVE_ADDRESS.toLowerCase();
};

// Get chain symbol from chain id
const getChainSymbol = (chainId: number | string) => {
  const chain = getChainById(chainId);

  const symbol = (chain?.symbol || chain?.nativeCurrency.symbol || '').toUpperCase();

  if (symbol === 'BNB') return 'BSC';
  return symbol;
};

// Convert chain symbol for bridge api
const getBridgeChainSymbol = (chainId: number | string) => {
  const symbol = getChainSymbol(chainId).toUpperCase();

  if (symbol === 'BNB') return 'BSC';

  return symbol.slice(0, 3);
};

interface SwapTransactionRequest {
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

export interface SubmitFusionOrderRequest {
  chain: string;
  toChain?: string;
  order: {
    maker: string;
    makerAsset: string;
    takerAsset: string;
    makerTraits: string;
    salt: string;
    makingAmount: string;
    takingAmount: string;
    receiver: string;
  };
  quoteId: string;
  extension: string;
  signature: string;
  orderHash?: string;
}

// Get swap endpoint
const getSwapEndpoint = (action: 'quote' | 'prepare') => {
  return action === 'quote' ? `/quoter/quote` : `/quoter/swap`;
};

// Build quote payload
function buildQuotePayload(request: SwapQuoteRequest, chainId: any) {
  const slippageValue = parseFloat(request.slippage || '1');

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

// Get swap quote
export async function getSwapQuote(
  chainId: number | string,
  request: SwapQuoteRequest,
  signal?: AbortSignal
): Promise<SwapQuote> {
  console.log(request, '-------------');

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

  // Handle normal swap response
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

// Prepare swap transaction
export async function prepareSwapTransaction(
  request: SwapTransactionRequest
): Promise<SwapTransactionData[]> {
  const { quote, senderAddress, slippageTolerance, ...rest } = request;

  // Normalize native token address
  const normalizedTokenInAddress = isNativeAddress(request.tokenIn.address)
    ? AGGREGATOR_NATIVE_ADDRESS.toLowerCase()
    : request.tokenIn.address;

  // Normalize output token address
  const normalizedTokenOutAddress = isNativeAddress(request.tokenOut.address)
    ? AGGREGATOR_NATIVE_ADDRESS.toLowerCase()
    : request.tokenOut.address;

  const payload = {
    ...rest,

    tokenIn: {
      ...request.tokenIn,
      address: normalizedTokenInAddress,
      name: request.tokenIn.symbol,
    },

    tokenOut: {
      ...request.tokenOut,
      address: normalizedTokenOutAddress,
      name: request.tokenOut.symbol,
    },

    recipient: request.senderAddress,

    chainId: getChainSymbol(request.chainId),
  };

  const res = await fetchApiResponseFromProxy<any>(getSwapEndpoint('prepare'), 'POST', payload);

  const txData = res.data?.data || res.data;

  if (!txData) {
    throw new Error('No transaction data received');
  }

  return Array.isArray(txData) ? txData : [txData];
}

// Get bridge quote
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

// Prepare bridge transaction
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

    // Add extra slippage buffer
    slippageTolerance: (request.slippageTolerance || 0.5) + 1,
  });

  return res.data;
}

// Get 1inch fusion quote
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

// Build fusion order
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

// Submit fusion order
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
