import type * as StellarSDK from '@stellar/stellar-sdk';

export interface LiquidityPoolReserve {
  asset: StellarSDK.Asset;
  amount: string;
}

export interface LiquidityPool {
  id: string;
  totalShares: string;
  reserves: LiquidityPoolReserve[];
  fee: number;
}

export interface SwapPath {
  path: StellarSDK.Asset[];
  pools: LiquidityPool[];
  estimatedOutput: string;
  priceImpact: number;
  hops: number;
}

export interface SwapQuote {
  fromAsset: StellarSDK.Asset;
  toAsset: StellarSDK.Asset;
  inputAmount: string;
  estimatedOutput: string;
  minimumOutput: string;
  path: SwapPath;
  alternativePaths: SwapPath[];
  priceImpact: number;
  slippageTolerance: number;
  timestamp: number;
}

export interface SwapOptions {
  slippageTolerance?: number;
  maxHops?: number;
  fee?: string;
  memo?: string;
  timeout?: number;
}

export interface AmmSwapTransaction {
  id: string;
  type: 'swap';
  from: string;
  quote: SwapQuote;
  sequence: string;
  fee: string;
  memo?: string;
  timestamp: number;
  status: 'pending' | 'success' | 'failed';
  xdr: string;
  networkKey: string;
  txHash?: string;
}

import type { TokenInfo, PriceInfo } from './stellar.types';
export type { TokenInfo, PriceInfo };

export type TokenPlaceholder = {
  code: string;
  balance?: string;
};

export interface SwapState {
  fromToken: any | null;
  toToken: TokenInfo | null;
  fromAmount: string;
  toAmount: string;
  quote: SwapQuote | null;
  isLoading: boolean;
  error: string | null;
  slippageTolerance: number;
  transaction: AmmSwapTransaction | null;
}
