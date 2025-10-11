import { useEffect, useRef, useState } from 'react';

export interface CoinMetadata {
  id: string;
  symbol: string;
  name: string;
  image: string;
  description?: string;
  market_cap_rank?: number;
  links?: {
    homepage?: string[];
    blockchain_site?: string[];
  };
}

interface CoinGeckoCache {
  [symbol: string]: {
    data: CoinMetadata;
    timestamp: number;
  };
}

const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours
// const CACHE_KEY = "coingecko_metadata_cache";
const RATE_LIMIT_DELAY = 50000; // 1.5 seconds between calls (free tier limit)

// Simple mapping for dYdX tickers to CoinGecko IDs
const TICKER_TO_COINGECKO_ID: { [key: string]: string } = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  SOL: 'solana',
  AVAX: 'avalanche-2',
  MATIC: 'matic-network',
  DOGE: 'dogecoin',
  DOT: 'polkadot',
  // UNI: "uniswap",
  // LINK: "chainlink",
  // ATOM: "cosmos",
  // LTC: "litecoin",
  // BCH: "bitcoin-cash",
  // XRP: "ripple",
  // ADA: "cardano",
  // ALGO: "algorand",
  // FIL: "filecoin",
  // AAVE: "aave",
  // SUSHI: "sushi",
  // CRV: "curve-dao-token",
  // COMP: "compound-governance-token",
  // MKR: "maker",
  // YFI: "yearn-finance",
  // SNX: "havven",
  // UMA: "uma",
  // Add more mappings as needed
};

export function useCoinGeckoMetadata() {
  const [cache, setCache] = useState<CoinGeckoCache>(() => {
    // Load cache from memory on mount
    try {
      const stored = (window as any).__coinGeckoCache;
      if (stored) {
        return stored;
      }
      return {};
    } catch {
      return {};
    }
  });

  const [loading, setLoading] = useState<{ [symbol: string]: boolean }>({});
  const [errors, setErrors] = useState<{ [symbol: string]: string }>({});
  const requestQueueRef = useRef<Array<() => Promise<void>>>([]);
  const isProcessingRef = useRef(false);

  // Save cache to memory whenever it changes
  useEffect(() => {
    (window as any).__coinGeckoCache = cache;
  }, [cache]);

  // Process request queue with rate limiting
  const processQueue = async () => {
    if (isProcessingRef.current || requestQueueRef.current.length === 0) {
      return;
    }

    isProcessingRef.current = true;

    while (requestQueueRef.current.length > 0) {
      const request = requestQueueRef.current.shift();
      if (request) {
        await request();
        // Wait before next request to respect rate limits
        if (requestQueueRef.current.length > 0) {
          await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY));
        }
      }
    }

    isProcessingRef.current = false;
  };

  const fetchCoinData = async (symbol: string, coingeckoId: string) => {
    try {
      console.log(`[CoinGecko] Fetching data for ${symbol} (${coingeckoId})`);

      const response = await fetch(
        `https://api.coingecko.com/api/v3/coins/${coingeckoId}?localization=false&tickers=false&market_data=false&community_data=false&developer_data=false`
      );

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
        links: data.links,
      };

      // Update cache
      setCache(prev => ({
        ...prev,
        [symbol]: {
          data: metadata,
          timestamp: Date.now(),
        },
      }));

      setLoading(prev => ({ ...prev, [symbol]: false }));
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[symbol];
        return newErrors;
      });

      console.log(`[CoinGecko] Successfully cached ${symbol}`);
    } catch (error: any) {
      console.error(`[CoinGecko] Error fetching ${symbol}:`, error);
      setLoading(prev => ({ ...prev, [symbol]: false }));
      setErrors(prev => ({
        ...prev,
        [symbol]: error.message || 'Failed to fetch metadata',
      }));
    }
  };

  const getCoinMetadata = (ticker: string): CoinMetadata | null => {
    // Extract symbol from ticker (e.g., "BTC-USD" -> "BTC")
    const symbol = ticker.split('-')[0].toUpperCase();

    // Check cache first
    const cached = cache[symbol];
    if (cached) {
      const age = Date.now() - cached.timestamp;
      if (age < CACHE_DURATION) {
        return cached.data;
      }
    }

    // If not in cache and not already loading, queue a fetch
    if (!loading[symbol] && !errors[symbol]) {
      const coingeckoId = TICKER_TO_COINGECKO_ID[symbol];

      if (!coingeckoId) {
        console.warn(`[CoinGecko] No mapping found for ${symbol}`);
        setErrors(prev => ({ ...prev, [symbol]: 'No mapping found' }));
        return null;
      }

      setLoading(prev => ({ ...prev, [symbol]: true }));

      // Add to queue
      requestQueueRef.current.push(() => fetchCoinData(symbol, coingeckoId));

      // Start processing queue
      processQueue();
    }

    return cached?.data || null;
  };

  const getCoinIcon = (ticker: string): string => {
    const metadata = getCoinMetadata(ticker);
    if (metadata?.image) {
      return metadata.image;
    }

    // Fallback to generic icon URL
    const symbol = ticker.split('-')[0].toLowerCase();
    return `https://cryptoicons.org/api/icon/${symbol}/200`;
  };

  const preloadCoins = (tickers: string[]) => {
    tickers.forEach(ticker => {
      const symbol = ticker.split('-')[0].toUpperCase();
      const cached = cache[symbol];

      if (!cached || Date.now() - cached.timestamp >= CACHE_DURATION) {
        if (!loading[symbol]) {
          const coingeckoId = TICKER_TO_COINGECKO_ID[symbol];
          if (coingeckoId) {
            setLoading(prev => ({ ...prev, [symbol]: true }));
            requestQueueRef.current.push(() => fetchCoinData(symbol, coingeckoId));
          }
        }
      }
    });

    processQueue();
  };

  const getCacheStats = () => {
    const now = Date.now();
    const validCache = Object.values(cache).filter(
      item => now - item.timestamp < CACHE_DURATION
    ).length;
    const totalCache = Object.keys(cache).length;

    return {
      valid: validCache,
      total: totalCache,
      expired: totalCache - validCache,
    };
  };

  return {
    getCoinMetadata,
    getCoinIcon,
    preloadCoins,
    loading,
    errors,
    cache,
    getCacheStats,
  };
}
