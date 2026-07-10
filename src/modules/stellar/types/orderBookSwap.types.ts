import type * as StellarSDK from '@stellar/stellar-sdk';

import type { TokenInfo } from './stellar.types';

export interface LargeOrderOffer {
  id: string;
  selling: StellarSDK.Asset;
  buying: StellarSDK.Asset;
  amount: string;
  price: string;
  filled: string;
  timestamp: number;
}

export interface LargeOrderQuote {
  fromAsset: StellarSDK.Asset;
  toAsset: StellarSDK.Asset;
  amount: string;
  price: string;
  total: string;
  slippageTolerance: number;
  timestamp: number;
}

export interface LargeOrderOptions {
  slippageTolerance?: number;
  fee?: string;
  memo?: string;
  timeout?: number;
}

export interface LargeOrderTransaction {
  id: string;
  type: 'large-order';
  from: string;
  quote: LargeOrderQuote;
  sequence: string;
  fee: string;
  memo?: string;
  timestamp: number;
  status: 'pending' | 'success' | 'failed';
  xdr: string;
  networkKey: string;
  txHash?: string;
  offerId?: number;
}

export type { TokenInfo };

export interface LargeOrderState {
  isBuy: boolean;
  fromToken: TokenInfo | null;
  toToken: TokenInfo | null;
  amount: string;
  price: string;
  total: string;
  quote: LargeOrderQuote | null;
  isLoading: boolean;
  error: string | null;
  slippageTolerance: number;
  transaction: LargeOrderTransaction | null;
}

export interface PriceInfo {
  price: number;
  change24h: number;
  high24h: number;
  low24h: number;
}
