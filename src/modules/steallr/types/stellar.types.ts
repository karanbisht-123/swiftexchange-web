import type * as StellarSDK from '@stellar/stellar-sdk';

export interface TokenInfo {
  asset: StellarSDK.Asset;
  code: string;
  issuer?: string;
  name?: string;
  icon?: string;
  balance?: string;
  price?: number;
  isPopular?: boolean;
  decimals?: number;
  hasTrustline?: boolean;
}

export interface PriceInfo {
  price: number;
  change24h: number;
  high24h: number;
  low24h: number;
}
