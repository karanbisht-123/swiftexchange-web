import { getIndexerClient } from '../client/clients';

export interface CoinMetadata {
  id: string;
  symbol: string;
  name: string;
  image: any;
  market_cap_rank?: number;
}

interface CacheEntry {
  data: CoinMetadata;
  timestamp: number;
}

interface QueueItem {
  symbol: string;
  coingeckoId: string;
  priority: number;
  retries: number;
}

class MetadataService {
  private cache = new Map<string, CacheEntry>();
  private readonly CACHE_DURATION = 24 * 60 * 60 * 1000;
  private readonly STORAGE_KEY = 'dydx_metadata_cache_v4';

  private circuitBreakerOpen = false;
  private circuitBreakerOpenedAt = 0;
  private circuitBreakerLevel = 0;
  private readonly CIRCUIT_BREAKER_TIMEOUTS = [
    5 * 60 * 1000,
    15 * 60 * 1000,
    30 * 60 * 1000,
    60 * 60 * 1000,
  ];

  private readonly BASE_DELAY = 3000;
  private readonly MAX_RETRIES = 2;
  private readonly MAX_QUEUE_SIZE = 50;

  private queue: QueueItem[] = [];
  private processing = false;
  private pendingSymbols = new Set<string>();

  private consecutiveErrors = 0;
  private errorCooldown = false;

  private listeners = new Set<() => void>();

  private assetMapping: Record<string, string> | null = null;
  private mappingPromise: Promise<void> | null = null;
  private mappingInitialized = false;

  private readonly PRIORITY_MAPPINGS: Record<string, string> = {
    BTC: 'bitcoin',
    ETH: 'ethereum',
    USDT: 'tether',
    BNB: 'binancecoin',
    SOL: 'solana',
    USDC: 'usd-coin',
    XRP: 'ripple',
    DOGE: 'dogecoin',
    ADA: 'cardano',
    TRX: 'tron',
    AVAX: 'avalanche-2',
    MATIC: 'matic-network',
    DOT: 'polkadot',
    LINK: 'chainlink',
    UNI: 'uniswap',
  };

  constructor() {
    this.loadFromStorage();
    this.cleanExpiredCache();
    this.initializeAssetMapping();
    this.startCircuitBreakerMonitor();
  }

  private startCircuitBreakerMonitor(): void {
    setInterval(() => {
      if (this.circuitBreakerOpen) {
        const timeout = this.CIRCUIT_BREAKER_TIMEOUTS[this.circuitBreakerLevel];
        const elapsed = Date.now() - this.circuitBreakerOpenedAt;

        if (elapsed >= timeout) {
          this.closeCircuitBreaker();
        }
      }
    }, 60000);
  }

  private openCircuitBreaker(reason: string): void {
    this.circuitBreakerOpen = true;
    this.circuitBreakerOpenedAt = Date.now();

    const timeout = this.CIRCUIT_BREAKER_TIMEOUTS[this.circuitBreakerLevel];
    const minutes = Math.round(timeout / 60000);

    console.warn(
      `Circuit breaker OPEN (Level ${this.circuitBreakerLevel}) - ${reason} - Cooldown: ${minutes}min`
    );

    this.queue = [];
    this.pendingSymbols.clear();
    this.processing = false;

    if (this.circuitBreakerLevel < this.CIRCUIT_BREAKER_TIMEOUTS.length - 1) {
      this.circuitBreakerLevel++;
    }
  }

  private closeCircuitBreaker(): void {
    this.circuitBreakerOpen = false;
    this.consecutiveErrors = 0;
    this.errorCooldown = false;

    setTimeout(
      () => {
        if (!this.circuitBreakerOpen && this.circuitBreakerLevel > 0) {
          this.circuitBreakerLevel = Math.max(0, this.circuitBreakerLevel - 1);
        }
      },
      10 * 60 * 1000
    );
  }

  // ==================== DYNAMIC MAPPING WITH PRIORITY ====================

  private async initializeAssetMapping(): Promise<void> {
    if (this.mappingPromise) return this.mappingPromise;

    this.mappingPromise = (async () => {
      try {
        const response = await fetch('https://api.coingecko.com/api/v3/coins/list');

        if (!response.ok) {
          throw new Error(`Failed to fetch CoinGecko list: ${response.status}`);
        }

        const coinsList = (await response.json()) as Array<{
          id: string;
          symbol: string;
          name: string;
        }>;

        // Create symbol to ID mapping
        const symbolToId = new Map<string, string>();
        coinsList.forEach(coin => {
          const symbol = coin.symbol.toUpperCase();
          if (!symbolToId.has(symbol)) {
            symbolToId.set(symbol, coin.id);
          }
        });

        // Get our markets
        const indexerClient = getIndexerClient();
        const markets = await indexerClient.markets.getPerpetualMarkets();

        this.assetMapping = {};

        if (markets?.markets) {
          Object.keys(markets.markets).forEach(ticker => {
            const baseAsset = ticker.split('-')[0].toUpperCase();

            let coingeckoId: string | undefined = this.PRIORITY_MAPPINGS[baseAsset];
            if (!coingeckoId) {
              coingeckoId = symbolToId.get(baseAsset);
            }

            if (coingeckoId) {
              this.assetMapping![baseAsset] = coingeckoId;
            } else {
              console.warn(` No CoinGecko ID found for ${baseAsset}`);
            }
          });
        }

        this.mappingInitialized = true;
      } catch (error) {
        console.error('Failed to initialize coin mapping:', error);
        this.assetMapping = {};
        this.mappingInitialized = true;
      }
    })();

    return this.mappingPromise;
  }

  // ==================== CACHE MANAGEMENT ====================

  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        const data = JSON.parse(stored) as Record<string, CacheEntry>;
        const now = Date.now();

        Object.entries(data).forEach(([key, value]) => {
          if (now - value.timestamp < this.CACHE_DURATION) {
            this.cache.set(key, value);
          }
        });
      }
    } catch (error) {
      localStorage.removeItem(this.STORAGE_KEY);
    }
  }

  private saveToStorage(): void {
    try {
      const data: Record<string, CacheEntry> = {};
      this.cache.forEach((value, key) => {
        data[key] = value;
      });
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
      console.log(error, 'faild to save locally ');
    }
  }

  private cleanExpiredCache(): void {
    const now = Date.now();

    this.cache.forEach((entry, key) => {
      if (now - entry.timestamp >= this.CACHE_DURATION) {
        this.cache.delete(key);
      }
    });

    this.saveToStorage();
  }

  // ==================== QUEUE MANAGEMENT ====================

  private async processQueue(): Promise<void> {
    if (
      this.processing ||
      this.queue.length === 0 ||
      this.circuitBreakerOpen ||
      this.errorCooldown
    ) {
      return;
    }

    this.processing = true;

    while (this.queue.length > 0 && !this.circuitBreakerOpen && !this.errorCooldown) {
      this.queue.sort((a, b) => b.priority - a.priority);

      const item = this.queue.shift()!;
      await this.fetchMetadata(item);

      if (this.queue.length > 0) {
        const delay = this.BASE_DELAY * (1 + this.circuitBreakerLevel);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    this.processing = false;
  }

  private async fetchMetadata(item: QueueItem): Promise<void> {
    if (this.circuitBreakerOpen || item.retries >= this.MAX_RETRIES) {
      this.pendingSymbols.delete(item.symbol);
      return;
    }

    try {
      const response = await fetch(
        `https://api.coingecko.com/api/v3/coins/${item.coingeckoId}?localization=false&tickers=false&market_data=false&community_data=false&developer_data=false&sparkline=false`,
        {
          headers: {
            Accept: 'application/json',
          },
        }
      );

      if (response.status === 429) {
        this.openCircuitBreaker('Rate limit (429)');
        this.pendingSymbols.delete(item.symbol);
        return;
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      const metadata: CoinMetadata = {
        id: data.id,
        symbol: data.symbol.toUpperCase(),
        name: data.name,
        image: data.image?.large || data.image?.small || '',
        market_cap_rank: data.market_cap_rank,
      };

      this.cache.set(item.symbol, {
        data: metadata,
        timestamp: Date.now(),
      });

      this.pendingSymbols.delete(item.symbol);
      this.consecutiveErrors = 0;

      this.saveToStorage();
      this.notifyListeners();
    } catch (error: any) {
      this.consecutiveErrors++;
      console.error(`Failed to fetch ${item.symbol}:`, error.message);

      if (this.consecutiveErrors >= 2) {
        this.openCircuitBreaker(`${this.consecutiveErrors} consecutive errors`);
        this.pendingSymbols.delete(item.symbol);
        return;
      }

      if (!this.errorCooldown) {
        this.errorCooldown = true;
        setTimeout(() => {
          this.errorCooldown = false;
        }, 30000);
      }

      if (item.retries < this.MAX_RETRIES) {
        this.queue.push({
          ...item,
          retries: item.retries + 1,
          priority: Math.max(1, item.priority - 2),
        });
      } else {
        this.pendingSymbols.delete(item.symbol);
      }
    }
  }

  // ==================== PUBLIC API ====================

  async getMetadata(ticker: string): Promise<CoinMetadata | null> {
    if (!this.mappingInitialized) {
      await this.initializeAssetMapping();
    }

    const symbol = ticker.split('-')[0].toUpperCase();
    const cached = this.cache.get(symbol);

    if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
      return cached.data;
    }

    if (
      !this.circuitBreakerOpen &&
      !this.pendingSymbols.has(symbol) &&
      this.assetMapping &&
      this.queue.length < this.MAX_QUEUE_SIZE
    ) {
      const coingeckoId = this.assetMapping[symbol];
      if (coingeckoId) {
        this.pendingSymbols.add(symbol);
        this.queue.push({
          symbol,
          coingeckoId,
          priority: 5,
          retries: 0,
        });
        this.processQueue();
      }
    }

    return cached?.data || null;
  }

  getCoinIcon(ticker: string): string {
    const symbol = ticker.split('-')[0].toUpperCase();
    const cached = this.cache.get(symbol);

    if (cached?.data?.image) {
      return cached.data.image;
    }

    console.error(`No icon found for ${symbol}`);
    return `https://cryptoicons.org/api/icon/${symbol.toLowerCase()}/200`;
  }

  async preloadBatch(tickers: string[]): Promise<void> {
    if (!this.mappingInitialized) {
      await this.initializeAssetMapping();
    }

    if (this.circuitBreakerOpen) {
      return;
    }

    const unique = [...new Set(tickers.map(t => t.split('-')[0].toUpperCase()))];
    const now = Date.now();

    const needsFetch = unique
      .filter(symbol => {
        const cached = this.cache.get(symbol);
        return !cached || now - cached.timestamp >= this.CACHE_DURATION;
      })
      .slice(0, this.MAX_QUEUE_SIZE);

    if (needsFetch.length === 0) {
      return;
    }

    needsFetch.forEach((symbol, index) => {
      if (this.assetMapping && this.assetMapping[symbol] && !this.pendingSymbols.has(symbol)) {
        this.pendingSymbols.add(symbol);
        this.queue.push({
          symbol,
          coingeckoId: this.assetMapping[symbol],
          priority: Math.max(10 - Math.floor(index / 5), 1),
          retries: 0,
        });
      }
    });

    this.processQueue();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    this.listeners.forEach(listener => {
      try {
        listener();
      } catch (error) {}
    });
  }

  getCacheStats() {
    const now = Date.now();
    let valid = 0;
    let expired = 0;

    this.cache.forEach(entry => {
      if (now - entry.timestamp < this.CACHE_DURATION) {
        valid++;
      } else {
        expired++;
      }
    });

    const cooldownRemaining = this.circuitBreakerOpen
      ? Math.max(
          0,
          this.CIRCUIT_BREAKER_TIMEOUTS[this.circuitBreakerLevel] -
            (now - this.circuitBreakerOpenedAt)
        )
      : 0;

    return {
      valid,
      total: this.cache.size,
      expired,
      pending: this.pendingSymbols.size,
      queueLength: this.queue.length,
      circuitBreakerOpen: this.circuitBreakerOpen,
      circuitBreakerLevel: this.circuitBreakerLevel,
      cooldownRemainingMs: cooldownRemaining,
      cooldownRemainingMin: Math.ceil(cooldownRemaining / 60000),
    };
  }

  clearCache(): void {
    this.cache.clear();
    this.queue = [];
    this.pendingSymbols.clear();
    localStorage.removeItem(this.STORAGE_KEY);
  }

  forceCloseCircuitBreaker(): void {
    this.closeCircuitBreaker();
  }

  resetCircuitBreakerLevel(): void {
    this.circuitBreakerLevel = 0;
  }
}

export const metadataService = new MetadataService();
