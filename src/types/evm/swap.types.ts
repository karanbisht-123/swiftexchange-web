export interface Asset {
  code: string;
  name: string;
  decimals: number;
  address: string;
  balance: number;
  logoUri: string | null;
  isNative: boolean;
}

export type SwapType = 'EthToUsdc' | 'UsdcToWeth' | 'EthToToken' | 'TokenToEth' | 'TokenToToken';

export interface SwapQuoteRequest {
  tokenIn: {
    symbol: string;
    name: string;
    decimals: number;
    address: string;
    balance: string;
    logoUri: string | null;
    chainId?: number | string;
  };
  tokenOut: {
    symbol: string;
    name: string;
    decimals: number;
    address: string;
    balance: string;
    logoUri: string | null;
    chainId?: number | string;
  };
  amount: string;
  recipient?: string;
  slippage?: string;
}


export interface SwapQuote {
  inputAmount: string;
  inputToken: string;
  outputAmount: string;
  outputToken: string;
  pricePerToken: string;
  fee: number;
  networkFee?: number;
  poolAddress: string;
  priceImpact: string;
  rawQuote: any;
  provider: string;
  minimumReceived?: string;
}


export interface UnifiedSwapResponse {
  success: boolean;
  provider: string;
  data: any;
}


export interface PrepareRequest {
  address: string;
  swapData: string;
  swapType: string;
  approveData: string;
  value: string;
}

export interface ExecuteRequest {
  txs: string[];
}

export interface TokenMetadata {
  name: string;
  code: string;
  decimals: number;
  logoUri: string | null;
}

export interface CachedMetadata {
  data: TokenMetadata;
  timestamp: number;
}
export interface FusionPreset {
  auctionDuration: number;
  startAuctionIn: number;
  bankFee: string;
  initialRateBump: number;
  auctionStartAmount: string;
  auctionEndAmount: string;
  tokenFee: string;
  exclusiveResolver: string | null;
  estP: number;
  allowPartialFills: boolean;
  allowMultipleFills: boolean;
  gasCost: {
    gasBumpEstimate: number;
    gasPriceEstimate: string;
  };
  points: Array<{
    delay: number;
    coefficient: number;
  }>;
  startAmount: string;
  secretsCount?: number;
}

export interface FusionQuote {
  quoteId: string;
  fromTokenAmount: string;
  toTokenAmount: string;
  srcTokenAmount?: string;
  dstTokenAmount?: string;
  feeToken: string;
  presets: {
    fast: FusionPreset;
    medium: FusionPreset;
    slow: FusionPreset;
  };
  recommended_preset: string;
  prices: {
    usd: {
      fromToken: string;
      toToken: string;
    };
  };
  volume: {
    usd: {
      fromToken: string;
      toToken: string;
    };
  };
  priceImpactPercent: number;
  suggested: boolean;
  marketAmount: string;
  gas: number;
  pfGas: number;
}

export interface BuildFusionOrderRequest {
  quote: FusionQuote;
  tokenIn: string;
  tokenOut: string;
  amount: string;
  walletAddress: string;
  chain: string;
  preset: string;
  permit?: string;
  toChain?: string;
  secretCount?: number;
}

export interface FusionOrder {
  order: {
    salt: string;
    makerAsset: string;
    takerAsset: string;
    maker: string;
    receiver: string;
    allowedSender: string;
    makingAmount: string;
    takingAmount: string;
    makerTraits: string;
    offsets: string;
    interactions: string;
  };
  signature: string;
  quoteId: string;
  typedData: any;
  extension: string;
  orderHash: string;
}
