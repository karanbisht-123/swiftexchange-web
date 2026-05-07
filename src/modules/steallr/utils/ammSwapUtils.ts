import * as StellarSDK from '@stellar/stellar-sdk';
import type { SwapQuote, TokenInfo } from '../types/ammSwap.types';
import { getChainById } from '../../evm/utils/Chainregistry';
import { getTokenIcon } from '../../evm/utils/ChainUrlHelpers';

export function formatAssetName(asset: StellarSDK.Asset): string {
  if (asset.isNative()) {
    return 'XLM';
  }
  return asset.code;
}

export function formatAssetFullName(asset: StellarSDK.Asset): string {
  if (asset.isNative()) {
    return 'Stellar Lumens (XLM)';
  }
  return `${asset.code}:${asset.issuer?.substring(
    0,
    4
  )}...${asset.issuer?.substring(asset.issuer.length - 4)}`;
}

export function formatAmount(amount: string | number, decimals: number = 7): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num)) return '0';

  if (num === 0) return '0';
  if (num < 0.0000001) return '< 0.0000001';
  if (num > 1000000) {
    return `${(num / 1000000).toFixed(2)}M`;
  }
  if (num > 1000) {
    return `${(num / 1000).toFixed(2)}K`;
  }

  return num.toFixed(decimals).replace(/\.?0+$/, '');
}

export function formatPriceImpact(impact: number): {
  text: string;
  color: string;
} {
  const text = `${impact.toFixed(2)}%`;
  let color = 'text-green-500';

  if (impact > 5) {
    color = 'text-red-500';
  } else if (impact > 2) {
    color = 'text-yellow-500';
  }

  return { text, color };
}

export function calculateExchangeRate(fromAmount: string, toAmount: string): string {
  const from = parseFloat(fromAmount);
  const to = parseFloat(toAmount);

  if (from === 0 || isNaN(from) || isNaN(to)) return '0';

  const rate = to / from;
  return formatAmount(rate);
}

export function validateSwapAmount(
  amount: string,
  balance?: string
): {
  isValid: boolean;
  error?: string;
} {
  const num = parseFloat(amount);

  if (!amount || amount === '') {
    return { isValid: false, error: 'Amount is required' };
  }

  if (isNaN(num) || num <= 0) {
    return { isValid: false, error: 'Invalid amount' };
  }

  if (balance) {
    const balanceNum = parseFloat(balance);
    if (num > balanceNum) {
      return { isValid: false, error: 'Insufficient balance' };
    }
  }

  return { isValid: true };
}

export function isQuoteValid(quote: SwapQuote, maxAgeMs: number = 30000): boolean {
  return Date.now() - quote.timestamp < maxAgeMs;
}

export function getMinimumReceived(estimatedOutput: string, slippageTolerance: number): string {
  const output = parseFloat(estimatedOutput);
  const minimum = output * (1 - slippageTolerance / 100);
  return minimum.toFixed(7);
}

export function parseAssetString(assetStr: string): StellarSDK.Asset {
  if (assetStr === 'native' || assetStr === 'XLM') {
    return StellarSDK.Asset.native();
  }

  const parts = assetStr.split(':');
  if (parts.length !== 2) {
    throw new Error('Invalid asset format. Use CODE:ISSUER');
  }

  return new StellarSDK.Asset(parts[0], parts[1]);
}

export function assetToString(asset: StellarSDK.Asset): string {
  if (asset.isNative()) {
    return 'native';
  }
  return `${asset.code}:${asset.issuer}`;
}

export function assetsEqual(a: StellarSDK.Asset, b: StellarSDK.Asset): boolean {
  if (a.isNative() && b.isNative()) return true;
  if (a.isNative() || b.isNative()) return false;
  return a.code === b.code && a.issuer === b.issuer;
}

export function formatTimeRemaining(timestamp: number, maxAge: number = 30000): string {
  const elapsed = Date.now() - timestamp;
  const remaining = Math.max(0, maxAge - elapsed);
  const seconds = Math.ceil(remaining / 1000);

  if (seconds === 0) return 'Expired';
  return `${seconds}s`;
}

export function getPathDescription(path: StellarSDK.Asset[]): string {
  return path.map(formatAssetName).join(' → ');
}

export function calculateUsdValue(amount: string, price?: number): string | null {
  if (!price) return null;

  const num = parseFloat(amount);
  if (isNaN(num)) return null;

  const usdValue = num * price;
  return `$${formatAmount(usdValue, 2)}`;
}

export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;

  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

export function formatTxHash(hash: string, length: number = 8): string {
  if (hash.length <= length * 2) return hash;
  return `${hash.substring(0, length)}...${hash.substring(hash.length - length)}`;
}

export function getTokenIconUrl(asset: StellarSDK.Asset): string {
  const chainId = 'pubnet';
  const chain = getChainById(chainId);
  if (!chain) return asset.isNative() ? 'https://stellar.org/assets/icons/stellar-xlm-logo.svg' : '';

  return getTokenIcon(asset.isNative() ? 'XLM' : asset.code, chain, asset.isNative() ? undefined : asset.issuer);
}

export function createTokenInfo(
  asset: StellarSDK.Asset,
  balance?: string,
  price?: number
): TokenInfo {
  return {
    asset,
    code: formatAssetName(asset),
    issuer: asset.isNative() ? undefined : asset.issuer,
    balance,
    price,
    icon: getTokenIconUrl(asset),
  };
}
