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

export interface ActiveQuote {
  source: 'swap' | 'bridge' | 'fusion_plus' | 'stellar' | 'near_intent' | null;
  data: any;
  error: string | null;
  loading: boolean;
  alternativeQuote?: any;
}

export interface EvmGasCheckParams {
  fromChainId: number | string;
  swapAssets: any[];
  selectedSellAsset: any;
  sellAmount: string;
  actionType: 'SWAP' | 'BRIDGE';
  feePayType: 'native' | 'stablecoin';
  activeQuoteSource: 'swap' | 'bridge' | 'fusion_plus' | 'stellar' | 'near_intent' | null;
  activeQuoteData: any;
  swapQuoteNetworkFee: number | undefined;
  isGasless: boolean;
}

export interface StellarGasCheckParams {
  fromChainId: number | string;
  stellarAssets: any[];
  sellAssetSymbol: string;
  sellAmount: string;
  actionType: 'SWAP' | 'BRIDGE';
  feePayType: 'native' | 'stablecoin';
  activeQuoteData: any;
}

export interface BuyAmountParams {
  actionType: 'SWAP' | 'BRIDGE';
  isGasless: boolean;
  fusionQuote: any;
  showFusionScreen: boolean;
  selectedBuyAsset: any;
  activeQuoteSource: 'swap' | 'bridge' | 'fusion_plus' | 'stellar' | 'near_intent' | null;
  activeQuoteData: any;
  swapQuote: any;
  isSameAssetSelected: boolean;
  feePayType: 'native' | 'stablecoin';
}

export interface MinReceivedParams {
  actionType: 'SWAP' | 'BRIDGE';
  activeQuoteSource: 'swap' | 'bridge' | 'fusion_plus' | 'stellar' | 'near_intent' | null;
  activeQuoteData: any;
  feePayType: 'native' | 'stablecoin';
  fromChainId: number | string;
  swapQuote: any;
  selectedBuyAsset: any;
  userSlippageTolerance: number;
  calculatedBuyAmount: string;
}

export interface ButtonLabelParams {
  isFetchingSwapAssets: boolean;
  isQuoteLoading: boolean;
  isFetchingStellarAssets: boolean;
  sellAmount: string;
  isSameAssetSelected: boolean;
  errorMessage: string | null;
  isInsufficientBalance: boolean;
  isAmountLessThanFee: boolean;
  hasInsufficientStellarGas: boolean;
  hasInsufficientEvmGas: boolean;
  toChainId: number | string;
  selectedBuyAsset: any;
  nativeSymbol: string;
  missingWallets?: string[];
}

export interface ErrorParams {
  bridgeTxStatus: string;
  bridgeErrorMsg: string | null;
  swapError: string | null;
  activeQuoteError: string | null;
  isInsufficientBalance: boolean;
  isAmountLessThanFee: boolean;
  hasInsufficientStellarGas: boolean;
  hasInsufficientEvmGas: boolean;
  isSameAssetSelected: boolean;
  actionType: 'SWAP' | 'BRIDGE';
  crossChainWarning: string | null;
  activeQuoteData: any;
  feePayType: 'native' | 'stablecoin';
  nativeSymbol: string;
}
