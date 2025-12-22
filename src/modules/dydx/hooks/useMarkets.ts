import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { getIndexerClient, getSocketClient } from '../client/clients';
import type { WebSocketMessage } from '../utils/WebSocketManager';
import { metadataService } from './useCoinGeckoMetadata';

export interface MarketData {
  ticker: string;
  oraclePrice: string;
  priceChange24H: string;
  priceChange24HPercent: string;
  volume24H: string;
  trades24H: number;
  nextFundingRate: string;
  nextFundingAt: string;
  openInterest: string;
  marketCaps?: string;
  baseAsset: string;
  quoteAsset: string;
  status: string;
  marketId?: number;
  coinIcon: string;
  coinName?: string;
  initialMarginFraction?: string;
  maintenanceMarginFraction?: string;
  tickSize?: string;
  stepSize?: string;
  clobPairId?: string;
}

interface UseMarketsReturn {
  markets: Record<string, MarketData>;
  marketsList: MarketData[];
  getMarket: (ticker: string) => MarketData | undefined;
  error: string | null;
  isLoading: boolean;
  isConnected: boolean;
  totalMarkets: number;
  refreshMarkets: () => Promise<void>;
  cacheStats: ReturnType<typeof metadataService.getCacheStats>;
}

const METADATA_UPDATE_DEBOUNCE = 500;

export function useMarkets(): UseMarketsReturn {
  const [markets, setMarkets] = useState<Record<string, MarketData>>({});
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [cacheStats, setCacheStats] = useState(metadataService.getCacheStats());

  const unsubscribeRef = useRef<(() => void) | null>(null);
  const isMountedRef = useRef(true);
  const hasInitialDataRef = useRef(false);
  const lastUpdateTimeRef = useRef<number>(Date.now());
  const socketClientRef = useRef<any>(null);
  const metadataUpdateTimerRef = useRef<NodeJS.Timeout | null>(null);
  const metadataUpdateCounterRef = useRef(0);

  // Subscribe to CoinGecko metadata updates
  useEffect(() => {
    const unsubscribe = metadataService.subscribe(() => {
      setCacheStats(metadataService.getCacheStats());

      if (metadataUpdateTimerRef.current) clearTimeout(metadataUpdateTimerRef.current);

      metadataUpdateCounterRef.current++;
      const currentCount = metadataUpdateCounterRef.current;

      metadataUpdateTimerRef.current = setTimeout(() => {
        if (currentCount === metadataUpdateCounterRef.current && isMountedRef.current) {
          setMarkets(prev => {
            const updated = { ...prev };
            let hasChanges = false;

            Object.keys(updated).forEach(ticker => {
              const metadata = metadataService.getMetadata(ticker);
              if (metadata && metadata.image !== updated[ticker].coinIcon) {
                updated[ticker] = {
                  ...updated[ticker],
                  coinIcon: metadata.image,
                  coinName: metadata.name,
                };
                hasChanges = true;
              }
            });

            return hasChanges ? updated : prev;
          });
        }
      }, METADATA_UPDATE_DEBOUNCE);
    });

    return () => {
      unsubscribe();
      if (metadataUpdateTimerRef.current) clearTimeout(metadataUpdateTimerRef.current);
    };
  }, []);

  const enrichMarketData = useCallback(
    async (ticker: string, rawData: any): Promise<MarketData> => {
      const metadata = await metadataService.getMetadata(ticker);
      const baseAsset = ticker.split('-')[0];
      const quoteAsset = ticker.split('-')[1] || 'USD';

      return {
        ticker,
        baseAsset,
        quoteAsset,
        oraclePrice: rawData.oraclePrice ?? '0',
        priceChange24H: rawData.priceChange24H ?? '0',
        priceChange24HPercent: rawData.priceChange24HPercent ?? '0',
        volume24H: rawData.volume24H ?? '0',
        trades24H: Number(rawData.trades24H) || 0,
        nextFundingRate: rawData.nextFundingRate ?? '0',
        nextFundingAt: rawData.nextFundingRate ?? '',
        openInterest: rawData.openInterest ?? '0',
        marketCaps: rawData.marketCaps,
        status: rawData.status || 'ACTIVE',
        marketId: rawData.marketId,
        clobPairId: rawData.clobPairId,
        coinIcon: metadata?.image || metadataService.getCoinIcon(ticker),
        coinName: metadata?.name,
        initialMarginFraction: rawData.initialMarginFraction,
        maintenanceMarginFraction: rawData.maintenanceMarginFraction,
        tickSize: rawData.tickSize,
        stepSize: rawData.stepSize,
      };
    },
    []
  );

  const fetchInitialMarketData = useCallback(async () => {
    try {
      console.log('useMarkets: Fetching initial market data');
      const indexerClient = getIndexerClient();
      const response = await indexerClient.markets.getPerpetualMarkets();

      if (!isMountedRef.current) return;

      const marketsMap: Record<string, MarketData> = {};
      const tickers: string[] = [];

      if (response?.markets) {
        for (const [ticker, rawData] of Object.entries(response.markets)) {
          tickers.push(ticker);
          marketsMap[ticker] = await enrichMarketData(ticker, rawData);
        }
      }

      console.log(`useMarkets: Loaded ${tickers.length} markets from indexer`);
      setMarkets(marketsMap);
      setIsLoading(false);
      hasInitialDataRef.current = true;
      lastUpdateTimeRef.current = Date.now();

      if (tickers.length > 0) {
        metadataService.preloadBatch(tickers);
      }
    } catch (err: any) {
      console.error('useMarkets: Failed to fetch initial markets:', err);
      if (isMountedRef.current) {
        setError(err.message || 'Failed to load markets');
        setIsLoading(false);
      }
    }
  }, [enrichMarketData]);

  const handleWebSocketMessage = useCallback(
    (msg: WebSocketMessage) => {
      if (!isMountedRef.current || !msg.contents?.markets) return;

      const marketsPayload = msg.contents.oraclePrices;
      lastUpdateTimeRef.current = Date.now();

      setMarkets(prev => {
        const updated = { ...prev };
        let hasChanges = false;

        Object.entries(marketsPayload).forEach(([ticker, rawData]: [string, any]) => {
          const existing = updated[ticker];

          if (existing) {
            const needsUpdate =
              existing.oraclePrice !== rawData.oraclePrice ||
              existing.volume24H !== rawData.volume24H ||
              existing.status !== rawData.status ||
              existing.trades24H !== Number(rawData.trades24H) ||
              existing.nextFundingRate !== rawData.nextFundingRate ||
              existing.openInterest !== rawData.openInterest;

            if (needsUpdate) {
              updated[ticker] = {
                ...existing,
                oraclePrice: rawData.oraclePrice ?? existing.oraclePrice,
                priceChange24H: rawData.priceChange24H ?? existing.priceChange24H,
                priceChange24HPercent:
                  rawData.priceChange24HPercent ?? existing.priceChange24HPercent,
                volume24H: rawData.volume24H ?? existing.volume24H,
                trades24H:
                  rawData.trades24H !== undefined ? Number(rawData.trades24H) : existing.trades24H,
                nextFundingRate: rawData.nextFundingRate ?? existing.nextFundingRate,
                nextFundingAt: rawData.nextFundingAt ?? existing.nextFundingAt,
                openInterest: rawData.openInterest ?? existing.openInterest,
                status: rawData.status ?? existing.status,
                clobPairId: rawData.clobPairId ?? existing.clobPairId,
              };
              hasChanges = true;
            }
          } else {
            // New market appeared
            enrichMarketData(ticker, rawData).then(enriched => {
              if (isMountedRef.current) {
                setMarkets(current => ({ ...current, [ticker]: enriched }));
              }
            });
          }
        });

        return hasChanges ? updated : prev;
      });
    },
    [enrichMarketData]
  );

  const refreshMarkets = useCallback(async () => {
    console.log('useMarkets: Manual refresh triggered');
    setIsLoading(true);
    await fetchInitialMarketData();
  }, [fetchInitialMarketData]);

  useEffect(() => {
    isMountedRef.current = true;

    const initialize = async () => {
      await fetchInitialMarketData();

      if (!isMountedRef.current) return;
      const socketClient = getSocketClient();
      socketClientRef.current = socketClient;

      console.log('useMarkets: Subscribing to v4_markets channel');
      unsubscribeRef.current = socketClient.subscribeToMarkets(handleWebSocketMessage, true);

      // Listen to connection state changes
      const removeOnConnect = socketClient.onConnect(() => {
        console.log('useMarkets: WebSocket connected');
        setIsConnected(true);
        setError(null);

        // Resubscribe in case of reconnect
        if (unsubscribeRef.current) unsubscribeRef.current();
        unsubscribeRef.current = socketClient.subscribeToMarkets(handleWebSocketMessage, true);
      });

      const removeOnDisconnect = socketClient.onDisconnect(() => {
        console.log('useMarkets: WebSocket disconnected');
        setIsConnected(false);
      });

      // Initial connection status
      setIsConnected(socketClient.isConnected());

      // Cleanup for connection listeners
      return () => {
        removeOnConnect();
        removeOnDisconnect();
      };
    };

    const cleanupPromise = initialize();

    return () => {
      console.log('useMarkets: Component unmounting, cleaning up subscription');
      isMountedRef.current = false;

      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }

      if (metadataUpdateTimerRef.current) {
        clearTimeout(metadataUpdateTimerRef.current);
      }

      cleanupPromise.then(cleanup => cleanup?.());
    };
  }, [fetchInitialMarketData, handleWebSocketMessage]);

  const marketsList = useMemo(() => {
    return Object.values(markets).sort((a, b) => {
      const volA = parseFloat(a.volume24H) || 0;
      const volB = parseFloat(b.volume24H) || 0;
      return volB - volA;
    });
  }, [markets]);

  const getMarket = useCallback((ticker: string) => markets[ticker], [markets]);

  return {
    markets,
    marketsList,
    getMarket,
    error,
    isLoading,
    isConnected,
    totalMarkets: marketsList.length,
    refreshMarkets,
    cacheStats,
  };
}
