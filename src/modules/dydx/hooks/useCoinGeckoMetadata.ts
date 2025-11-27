// ==================== REACT HOOK ====================
import { useCallback, useEffect, useState } from 'react';

// ==================== TYPES ====================
export interface MarketData {
  ticker: string;
  oraclePrice: string;
  priceChange24H: string;
  volume24H: string;
  trades24H: number;
  nextFundingRate: string;
  nextFundingAt: string;
  openInterest: string;
  marketCaps?: string;
  baseAsset?: string;
  quoteAsset?: string;
  status?: string;
  marketId?: number;
  coinIcon?: string;
  coinName?: string;
}

export interface CoinMetadata {
  id: string;
  symbol: string;
  name: string;
  image: string;
  description?: string;
  market_cap_rank?: number;
}

interface CacheEntry {
  data: CoinMetadata;
  timestamp: number;
}

// ==================== CONSTANTS ====================
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours
const RATE_LIMIT_DELAY = 2100; // 2.1 seconds (safe for 30 calls/min)
const BATCH_SIZE = 5; // Process 5 coins at a time
const BATCH_DELAY = 10000; // 10 seconds between batches

const TICKER_TO_COINGECKO: Record<string, string> = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  SOL: 'solana',
  AVAX: 'avalanche-2',
  MATIC: 'matic-network',
  DOGE: 'dogecoin',
  DOT: 'polkadot',
  ATOM: 'cosmos',
  LINK: 'chainlink',
  UNI: 'uniswap',
  AAVE: 'aave',
  COMP: 'compound-governance-token',
  MKR: 'maker',
  SNX: 'havven',
  YFI: 'yearn-finance',
  SUSHI: 'sushi',
  CRV: 'curve-dao-token',
  BAL: 'balancer',
  RUNE: 'thorchain',
  NEAR: 'near',
  FTM: 'fantom',
  XTZ: 'tezos',
  EOS: 'eos',
  TRX: 'tron',
  ADA: 'cardano',
  XRP: 'ripple',
  LTC: 'litecoin',
  BCH: 'bitcoin-cash',
  XLM: 'stellar',
  ALGO: 'algorand',
  APT: 'aptos',
  ARB: 'arbitrum',
  OP: 'optimism',
  RNDR: 'render-token',
  IMX: 'immutable-x',
  LDO: 'lido-dao',
  INJ: 'injective-protocol',
  SUI: 'sui',
  SEI: 'sei-network',
  BLUR: 'blur',
  PEPE: 'pepe',
  WLD: 'worldcoin-wld',
  FET: 'fetch-ai',
  AGIX: 'singularitynet',
  OCEAN: 'ocean-protocol',
};

// ==================== METADATA SERVICE ====================
/**
 * Centralized metadata service with intelligent caching and rate limiting
 * Implements:
 * - Persistent localStorage caching
 * - Exponential backoff for rate limits
 * - Batch processing with configurable delays
 * - Automatic retry with max attempts
 */
class MetadataService {
  private cache: Map<string, CacheEntry> = new Map();
  private queue: Array<{ symbol: string; task: () => Promise<void> }> = [];
  private processing = false;
  private retryCount: Map<string, number> = new Map();
  private pendingSymbols: Set<string> = new Set();
  private listeners: Set<() => void> = new Set();
  private readonly maxRetries = 3;
  private readonly storageKey = 'dydx_coingecko_metadata_cache';

  constructor() {
    this.loadFromStorage();
    this.cleanExpiredCache();
  }

  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored) {
        const data = JSON.parse(stored) as Record<string, CacheEntry>;
        Object.entries(data).forEach(([key, value]) => {
          this.cache.set(key, value);
        });
        console.log(`[MetadataService] Loaded ${this.cache.size} cached entries`);
      }
    } catch (error) {
      console.warn('[MetadataService] Failed to load cache:', error);
    }
  }

  private saveToStorage(): void {
    try {
      const data: Record<string, CacheEntry> = {};
      this.cache.forEach((value, key) => {
        data[key] = value;
      });
      localStorage.setItem(this.storageKey, JSON.stringify(data));
    } catch (error) {
      console.warn('[MetadataService] Failed to save cache:', error);
    }
  }

  private cleanExpiredCache(): void {
    const now = Date.now();
    let cleaned = 0;

    this.cache.forEach((entry, key) => {
      if (now - entry.timestamp >= CACHE_DURATION) {
        this.cache.delete(key);
        cleaned++;
      }
    });

    if (cleaned > 0) {
      console.log(`[MetadataService] Cleaned ${cleaned} expired entries`);
      this.saveToStorage();
    }
  }

  private notifyListeners(): void {
    this.listeners.forEach(listener => {
      try {
        listener();
      } catch (error) {
        console.error('[MetadataService] Listener error:', error);
      }
    });
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private async processQueue(): Promise<void> {
    if (this.processing || this.queue.length === 0) return;

    this.processing = true;
    console.log(`[MetadataService] Processing queue with ${this.queue.length} items`);

    while (this.queue.length > 0) {
      const batch = this.queue.splice(0, BATCH_SIZE);

      await Promise.allSettled(batch.map(item => item.task()));

      if (this.queue.length > 0) {
        console.log(`[MetadataService] Waiting ${BATCH_DELAY}ms before next batch...`);
        await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
      }
    }

    this.processing = false;
    console.log('[MetadataService] Queue processing completed');
  }

  private async fetchMetadata(symbol: string, coingeckoId: string): Promise<void> {
    const retries = this.retryCount.get(symbol) || 0;

    if (retries >= this.maxRetries) {
      console.warn(`[MetadataService] Max retries (${this.maxRetries}) reached for ${symbol}`);
      this.pendingSymbols.delete(symbol);
      return;
    }

    try {
      console.log(`[MetadataService] Fetching ${symbol} (${coingeckoId}) - Attempt ${retries + 1}`);

      const response = await fetch(
        `https://api.coingecko.com/api/v3/coins/${coingeckoId}?localization=false&tickers=false&market_data=false&community_data=false&developer_data=false`
      );

      // Handle rate limiting
      if (response.status === 429) {
        console.warn(`[MetadataService] Rate limited for ${symbol}, retrying...`);
        this.retryCount.set(symbol, retries + 1);

        const retryDelay = Math.min(5000 * Math.pow(2, retries), 30000);
        await new Promise(resolve => setTimeout(resolve, retryDelay));

        this.queueFetch(symbol, true);
        return;
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      const metadata: CoinMetadata = {
        id: data.id,
        symbol: data.symbol.toUpperCase(),
        name: data.name,
        image: data.image?.large || data.image?.small || '',
        description: data.description?.en,
        market_cap_rank: data.market_cap_rank,
      };

      this.cache.set(symbol, {
        data: metadata,
        timestamp: Date.now(),
      });

      this.retryCount.delete(symbol);
      this.pendingSymbols.delete(symbol);
      this.saveToStorage();
      this.notifyListeners();

      console.log(`[MetadataService] Successfully cached ${symbol}`);

      // Respect rate limits
      await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY));
    } catch (error) {
      console.error(`[MetadataService] Error fetching ${symbol}:`, error);
      this.retryCount.set(symbol, retries + 1);
      this.pendingSymbols.delete(symbol);

      if (retries < this.maxRetries - 1) {
        this.queueFetch(symbol, true);
      }
    }
  }

  private queueFetch(symbol: string, skipPendingCheck = false): void {
    if (!skipPendingCheck && this.pendingSymbols.has(symbol)) {
      return;
    }

    const coingeckoId = TICKER_TO_COINGECKO[symbol];
    if (!coingeckoId) {
      return;
    }

    const retries = this.retryCount.get(symbol) || 0;
    if (retries >= this.maxRetries) {
      return;
    }

    this.pendingSymbols.add(symbol);

    const task = async () => this.fetchMetadata(symbol, coingeckoId);
    this.queue.push({ symbol, task });

    this.processQueue();
  }

  getMetadata(ticker: string): CoinMetadata | null {
    const symbol = ticker.split('-')[0].toUpperCase();
    const cached = this.cache.get(symbol);

    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return cached.data;
    }

    // Queue fetch if not cached or expired
    if (!this.pendingSymbols.has(symbol)) {
      this.queueFetch(symbol);
    }

    return cached?.data || null;
  }

  getCoinIcon(ticker: string): string {
    const metadata = this.getMetadata(ticker);
    if (metadata?.image) {
      return metadata.image;
    }

    // Fallback to generic icon
    const symbol = ticker.split('-')[0].toLowerCase();
    return `https://cryptoicons.org/api/icon/${symbol}/200`;
  }

  preloadBatch(tickers: string[]): void {
    const unique = [...new Set(tickers.map(t => t.split('-')[0].toUpperCase()))];

    const needsFetch = unique.filter(symbol => {
      const cached = this.cache.get(symbol);
      return !cached || Date.now() - cached.timestamp >= CACHE_DURATION;
    });

    console.log(`[MetadataService] Preloading ${needsFetch.length} of ${unique.length} coins`);

    needsFetch.forEach(symbol => this.queueFetch(symbol));
  }

  getCacheStats(): { valid: number; total: number; expired: number; pending: number } {
    const now = Date.now();
    let valid = 0;
    let expired = 0;

    this.cache.forEach(entry => {
      if (now - entry.timestamp < CACHE_DURATION) {
        valid++;
      } else {
        expired++;
      }
    });

    return {
      valid,
      total: this.cache.size,
      expired,
      pending: this.pendingSymbols.size,
    };
  }

  clearCache(): void {
    this.cache.clear();
    this.retryCount.clear();
    this.pendingSymbols.clear();
    localStorage.removeItem(this.storageKey);
    console.log('[MetadataService] Cache cleared');
  }
}

// ==================== SINGLETON INSTANCE ====================
export const metadataService = new MetadataService();

export function useCoinGeckoMetadata() {
  const [cacheStats, setCacheStats] = useState(metadataService.getCacheStats());

  useEffect(() => {
    const unsubscribe = metadataService.subscribe(() => {
      setCacheStats(metadataService.getCacheStats());
    });

    return unsubscribe;
  }, []);

  const getCoinMetadata = useCallback((ticker: string) => {
    return metadataService.getMetadata(ticker);
  }, []);

  const getCoinIcon = useCallback((ticker: string) => {
    return metadataService.getCoinIcon(ticker);
  }, []);

  const preloadCoins = useCallback((tickers: string[]) => {
    metadataService.preloadBatch(tickers);
  }, []);

  return {
    getCoinMetadata,
    getCoinIcon,
    preloadCoins,
    cacheStats,
    clearCache: () => metadataService.clearCache(),
  };
}
