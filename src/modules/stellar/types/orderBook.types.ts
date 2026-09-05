import type * as StellarSDK from '@stellar/stellar-sdk';

export interface OrderBookEntry {
  baseAsset: StellarSDK.Asset;
  counterAsset: StellarSDK.Asset;
  asks: Array<{
    price: string;
    amount: string;
    priceR: { n: number; d: number };
  }>;
  bids: Array<{
    price: string;
    amount: string;
    priceR: { n: number; d: number };
  }>;
}

export interface OrderBookData {
  baseAsset: StellarSDK.Asset;
  counterAsset: StellarSDK.Asset;
  asks: OrderBookEntry[];
  bids: OrderBookEntry[];
  timestamp: number;
}

export interface OrderBookOptions {
  limit?: number;
  resolution?: number;
}

export interface TokenInfo {
  asset: StellarSDK.Asset;
  code: string;
  issuer?: string;
  name?: string;
  icon?: string;
  balance?: string;
  price?: number;
  isPopular?: boolean;
}

export interface OrderBookState {
  baseToken: TokenInfo | null;
  counterToken: TokenInfo | null;
  orderBook: OrderBookData | null;
  isLoading: boolean;
  error: string | null;
  autoRefresh: boolean;
  refreshInterval: number;
}

export interface DepthInfo {
  totalAskVolume: string;
  totalBidVolume: string;
  spread: string;
  midpoint: string;
}
