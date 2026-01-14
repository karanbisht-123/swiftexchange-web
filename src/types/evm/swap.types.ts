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
  };
  tokenOut: {
    symbol: string;
    name: string;
    decimals: number;
    address: string;
    balance: string;
    logoUri: string | null;
  };
  amount: string;
  swapType: any;
}

export interface SwapQuote {
  inputAmount: string;
  inputToken: string;
  outputAmount: string;
  outputToken: string;
  pricePerToken: string;
  fee: number;
  poolAddress: string;
  priceImpact: string;
  rawQuote: any;
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
