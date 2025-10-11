import { useEffect, useRef, useState } from 'react';

import type { WebSocketMessage } from '../utils/WebSocketManager';
import { useCoinGeckoMetadata } from './useCoinGeckoMetadata';

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
  // Metadata fields
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
  // Metadata utilities
  getCoinIcon: (ticker: string) => string;
  metadataLoading: { [symbol: string]: boolean };
  cacheStats: { valid: number; total: number; expired: number };
}

export function useMarkets(): UseMarketsReturn {
  const [markets, setMarkets] = useState<Record<string, MarketData>>({});
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isConnected, setIsConnected] = useState(false);

  const unsubscribeRef = useRef<(() => void) | null>(null);
  const isMountedRef = useRef(true);
  const hasInitialDataRef = useRef(false);

  const {
    getCoinMetadata,
    getCoinIcon,
    preloadCoins,
    loading: metadataLoading,
    getCacheStats,
  } = useCoinGeckoMetadata();

  useEffect(() => {
    isMountedRef.current = true;
    let socketClient: any = null;
    let indexerClient: any = null;

    const fetchInitialMarketData = async () => {
      try {
        const { getIndexerClient } = await import('../client/clients');
        indexerClient = getIndexerClient();

        console.log(`[useMarkets] Fetching initial market data from API`);

        const data = await indexerClient.markets.getPerpetualMarkets();

        if (!isMountedRef.current) return;

        const marketsMap: Record<string, MarketData> = {};
        const tickers: string[] = [];

        if (data.markets) {
          Object.entries(data.markets).forEach(([ticker, marketData]: [string, any]) => {
            tickers.push(ticker);

            // Get metadata
            const metadata = getCoinMetadata(ticker);

            marketsMap[ticker] = {
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
              // Add metadata
              coinIcon: metadata?.image || getCoinIcon(ticker),
              coinName: metadata?.name,
            };
          });
        }

        setMarkets(marketsMap);
        setIsLoading(false);
        hasInitialDataRef.current = true;
        console.log(`[useMarkets] Loaded ${Object.keys(marketsMap).length} markets from API`);

        // Preload metadata for all coins (with rate limiting)
        if (tickers.length > 0) {
          console.log(`[useMarkets] Preloading metadata for ${tickers.length} coins`);
          preloadCoins(tickers);
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
    };

    const initializeWebSocket = async () => {
      try {
        const { getSocketClient } = await import('../client/clients');
        socketClient = getSocketClient();

        console.log(`[useMarkets] Connecting to WebSocket`);

        await socketClient.connect();

        if (!isMountedRef.current) return;

        setIsConnected(true);
        setError(null); // Clear any previous errors
        console.log('[useMarkets] WebSocket connected successfully');

        // Subscribe to real-time markets updates
        const handleMessage = (msg: WebSocketMessage) => {
          if (!isMountedRef.current) return;

          console.log('[useMarkets] WS message:', {
            type: msg.type,
            channel: msg.channel,
            hasContents: !!msg.contents,
          });

          if (msg.type !== 'channel_data' || !msg.contents) {
            return;
          }

          // dYdX sends market updates with trading data
          const updatedMarkets = msg.contents.trading || msg.contents;

          setMarkets(prev => {
            const updated = { ...prev };

            // Update markets with new data
            Object.entries(updatedMarkets).forEach(([ticker, marketData]: [string, any]) => {
              const metadata = getCoinMetadata(ticker);

              if (updated[ticker]) {
                // Merge with existing data
                updated[ticker] = {
                  ...updated[ticker],
                  oraclePrice: marketData.oraclePrice || updated[ticker].oraclePrice,
                  priceChange24H: marketData.priceChange24H || updated[ticker].priceChange24H,
                  volume24H: marketData.volume24H || updated[ticker].volume24H,
                  trades24H: marketData.trades24H || updated[ticker].trades24H,
                  nextFundingRate: marketData.nextFundingRate || updated[ticker].nextFundingRate,
                  nextFundingAt: marketData.nextFundingAt || updated[ticker].nextFundingAt,
                  openInterest: marketData.openInterest || updated[ticker].openInterest,
                  // Update metadata if available
                  coinIcon: metadata?.image || updated[ticker].coinIcon || getCoinIcon(ticker),
                  coinName: metadata?.name || updated[ticker].coinName,
                };
              } else {
                // Add new market
                updated[ticker] = {
                  ticker,
                  oraclePrice: marketData.oraclePrice || '0',
                  priceChange24H: marketData.priceChange24H || '0',
                  volume24H: marketData.volume24H || '0',
                  trades24H: marketData.trades24H || 0,
                  nextFundingRate: marketData.nextFundingRate || '0',
                  nextFundingAt: marketData.nextFundingAt || '',
                  openInterest: marketData.openInterest || '0',
                  coinIcon: metadata?.image || getCoinIcon(ticker),
                  coinName: metadata?.name,
                };
              }
            });

            return updated;
          });
        };

        unsubscribeRef.current = socketClient.subscribeToMarkets(handleMessage);
        console.log(`[useMarkets] Subscribed to markets channel`);

        const onConnectCleanup = socketClient.onConnect(() => {
          if (isMountedRef.current) {
            console.log('[useMarkets] WebSocket reconnected');
            setIsConnected(true);
            setError(null);
          }
        });

        const onDisconnectCleanup = socketClient.onDisconnect(() => {
          if (isMountedRef.current) {
            console.log('[useMarkets] WebSocket disconnected');
            setIsConnected(false);
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
      }
    };

    const initialize = async () => {
      const initialMarkets = await fetchInitialMarketData();
      console.log(initialMarkets, 'hii i am intial markets ---');
      if (isMountedRef.current) {
        const wsCleanup = await initializeWebSocket();
        return wsCleanup;
      }
    };

    const cleanupPromise = initialize();

    return () => {
      isMountedRef.current = false;
      console.log(`[useMarkets] Cleaning up`);

      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }

      cleanupPromise.then(cleanup => {
        if (cleanup) cleanup();
      });
    };
  }, []);

  const marketsList = Object.values(markets);

  const getMarket = (ticker: string) => markets[ticker];

  return {
    markets,
    marketsList,
    getMarket,
    error,
    isLoading,
    isConnected,
    totalMarkets: marketsList.length,
    getCoinIcon,
    metadataLoading,
    cacheStats: getCacheStats(),
  };
}
