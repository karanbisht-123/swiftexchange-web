import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { getIndexerClient } from '../client/clients';
import type { WebSocketMessage } from '../utils/WebSocketManager';
import { metadataService } from './useCoinGeckoMetadata';

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

interface UseMarketsReturn {
  markets: Record<string, MarketData>;
  marketsList: MarketData[];
  getMarket: (ticker: string) => MarketData | undefined;
  error: string | null;
  isLoading: boolean;
  isConnected: boolean;
  totalMarkets: number;
  getCoinIcon: (ticker: string) => string;
  cacheStats: { valid: number; total: number; expired: number; pending: number };
  refreshMarkets: () => Promise<void>;
}

export function useMarkets(): UseMarketsReturn {
  const [markets, setMarkets] = useState<Record<string, MarketData>>({});
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [cacheStats, setCacheStats] = useState(metadataService.getCacheStats());

  const unsubscribeRef = useRef<(() => void) | null>(null);
  const isMountedRef = useRef(true);
  const hasInitialDataRef = useRef(false);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const metadataUpdateCounterRef = useRef(0);

  useEffect(() => {
    const unsubscribe = metadataService.subscribe(() => {
      setCacheStats(metadataService.getCacheStats());
      metadataUpdateCounterRef.current++;
      const currentCount = metadataUpdateCounterRef.current;

      setTimeout(() => {
        if (currentCount === metadataUpdateCounterRef.current) {
          setMarkets(prev => {
            const updated = { ...prev };
            Object.keys(updated).forEach(ticker => {
              const metadata = metadataService.getMetadata(ticker);
              if (metadata) {
                updated[ticker] = {
                  ...updated[ticker],
                  coinIcon: metadata.image,
                  coinName: metadata.name,
                };
              }
            });
            return updated;
          });
        }
      }, 500);
    });

    return unsubscribe;
  }, []);

  const enrichMarketWithMetadata = useCallback((ticker: string, marketData: any): MarketData => {
    const metadata = metadataService.getMetadata(ticker);

    return {
      ticker,
      oraclePrice: marketData.oraclePrice || '0',
      priceChange24H: marketData.priceChange24H || '0',
      volume24H: marketData.volume24H || '0',
      trades24H: marketData.trades24H || 0,
      nextFundingRate: marketData.nextFundingRate || '0',
      nextFundingAt: marketData.nextFundingAt || '',
      openInterest: marketData.openInterest || '0',
      marketCaps: marketData.marketCaps,
      baseAsset: marketData.baseAsset,
      quoteAsset: marketData.quoteAsset,
      status: marketData.status,
      marketId: marketData.marketId,
      coinIcon: metadata?.image || metadataService.getCoinIcon(ticker),
      coinName: metadata?.name,
    };
  }, []);

  const fetchInitialMarketData = useCallback(async () => {
    try {
      const indexerClient = getIndexerClient();

      console.log('[useMarkets] Fetching initial market data from dYdX API');

      const data = await indexerClient.markets.getPerpetualMarkets();

      if (!isMountedRef.current) return null;

      const marketsMap: Record<string, MarketData> = {};
      const tickers: string[] = [];

      if (data.markets) {
        Object.entries(data.markets).forEach(([ticker, marketData]: [string, any]) => {
          tickers.push(ticker);
          marketsMap[ticker] = enrichMarketWithMetadata(ticker, marketData);
        });
      }

      setMarkets(marketsMap);
      setIsLoading(false);
      hasInitialDataRef.current = true;
      console.log(`[useMarkets] Loaded ${Object.keys(marketsMap).length} markets from API`);

      if (tickers.length > 0) {
        console.log(`[useMarkets] Starting metadata preload for ${tickers.length} coins`);
        metadataService.preloadBatch(tickers);
      }

      return marketsMap;
    } catch (err: any) {
      console.error('[useMarkets] Error fetching initial data:', err);
      if (isMountedRef.current) {
        setError(err.message || 'Failed to load markets');
        setIsLoading(false);
      }
      return null;
    }
  }, [enrichMarketWithMetadata]);

  const initializeWebSocket = useCallback(async () => {
    let socketClient: any = null;

    try {
      const { getSocketClient } = await import('../client/clients');
      socketClient = getSocketClient();

      console.log('[useMarkets] Connecting to dYdX WebSocket');

      await socketClient.connect();

      if (!isMountedRef.current) return null;

      setIsConnected(true);
      setError(null);
      console.log('[useMarkets] WebSocket connected successfully');

      // Subscribe to real-time markets updates
      const handleMessage = (msg: WebSocketMessage) => {
        if (!isMountedRef.current) return;

        if (msg.type !== 'channel_data' || !msg.contents) {
          return;
        }

        const updatedMarkets = msg.contents.trading || msg.contents;

        setMarkets(prev => {
          const updated = { ...prev };

          Object.entries(updatedMarkets).forEach(([ticker, marketData]: [string, any]) => {
            if (updated[ticker]) {
              updated[ticker] = {
                ...updated[ticker],
                oraclePrice: marketData.oraclePrice || updated[ticker].oraclePrice,
                priceChange24H: marketData.priceChange24H || updated[ticker].priceChange24H,
                volume24H: marketData.volume24H || updated[ticker].volume24H,
                trades24H: marketData.trades24H || updated[ticker].trades24H,
                nextFundingRate: marketData.nextFundingRate || updated[ticker].nextFundingRate,
                nextFundingAt: marketData.nextFundingAt || updated[ticker].nextFundingAt,
                openInterest: marketData.openInterest || updated[ticker].openInterest,
              };
            } else {
              updated[ticker] = enrichMarketWithMetadata(ticker, marketData);
            }
          });

          return updated;
        });
      };

      unsubscribeRef.current = socketClient.subscribeToMarkets(handleMessage);
      console.log('[useMarkets] Subscribed to markets channel');

      const onConnectCleanup = socketClient.onConnect(() => {
        if (isMountedRef.current) {
          console.log('[useMarkets] WebSocket reconnected');
          setIsConnected(true);
          setError(null);
          if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = null;
          }
        }
      });

      const onDisconnectCleanup = socketClient.onDisconnect(() => {
        if (isMountedRef.current) {
          console.log('[useMarkets] WebSocket disconnected');
          setIsConnected(false);
          if (hasInitialDataRef.current) {
            console.log('[useMarkets] Connection lost but using cached data');
          }
        }
      });

      return () => {
        onConnectCleanup();
        onDisconnectCleanup();
      };
    } catch (err: any) {
      console.error('[useMarkets] WebSocket error:', err);
      if (isMountedRef.current) {
        setIsConnected(false);

        if (!hasInitialDataRef.current) {
          setError(err.message || 'Failed to connect to WebSocket');
        } else {
          console.log('[useMarkets] WebSocket failed but initial data is available');
        }
      }
      return null;
    }
  }, [enrichMarketWithMetadata]);

  const refreshMarkets = useCallback(async () => {
    console.log('[useMarkets] Manual refresh triggered');
    await fetchInitialMarketData();
  }, [fetchInitialMarketData]);

  useEffect(() => {
    isMountedRef.current = true;

    const initialize = async () => {
      // Fetch initial data first
      await fetchInitialMarketData();

      // Then connect WebSocket for real-time updates
      if (isMountedRef.current) {
        const wsCleanup = await initializeWebSocket();
        return wsCleanup;
      }
    };

    const cleanupPromise = initialize();

    return () => {
      isMountedRef.current = false;
      console.log('[useMarkets] Cleaning up');

      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }

      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }

      cleanupPromise.then(cleanup => {
        if (cleanup) cleanup();
      });
    };
  }, [fetchInitialMarketData, initializeWebSocket]);
  const marketsList = useMemo(() => Object.values(markets), [markets]);

  const getMarket = useCallback((ticker: string) => markets[ticker], [markets]);
  const getCoinIcon = useCallback((ticker: string) => metadataService.getCoinIcon(ticker), []);

  return {
    markets,
    marketsList,
    getMarket,
    error,
    isLoading,
    isConnected,
    totalMarkets: marketsList.length,
    getCoinIcon,
    cacheStats,
    refreshMarkets,
  };
}
