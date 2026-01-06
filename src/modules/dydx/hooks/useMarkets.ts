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
  atomicResolution?: number;
  quantumConversionExponent?: number;
  stepBaseQuantums?: number;
  subticksPerTick?: number;
  marketType?: string;
  openInterestLowerCap?: string;
  openInterestUpperCap?: string;
  baseOpenInterest?: string;
  defaultFundingRate1H?: string;
  spotVolume?: string;
  marketCap?: string;
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
  const lastUpdateTimeRef = useRef<number>(0);
  const socketClientRef = useRef<any>(null);
  const metadataUpdateTimerRef = useRef<NodeJS.Timeout | null>(null);
  const metadataUpdateCounterRef = useRef(0);

  // Subscribe to metadata updates
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
                  marketCap: metadata.market_cap?.toString(),
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
        nextFundingAt: rawData.nextFundingAt ?? '',
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
        atomicResolution: rawData.atomicResolution,
        quantumConversionExponent: rawData.quantumConversionExponent,
        stepBaseQuantums: rawData.stepBaseQuantums,
        subticksPerTick: rawData.subticksPerTick,
        marketType: rawData.marketType,
        openInterestLowerCap: rawData.openInterestLowerCap,
        openInterestUpperCap: rawData.openInterestUpperCap,
        baseOpenInterest: rawData.baseOpenInterest,
        defaultFundingRate1H: rawData.defaultFundingRate1H,
        spotVolume: rawData.spotVolume,
        marketCap: metadata?.market_cap?.toString(),
      };
    },
    []
  );

  const fetchInitialMarketData = useCallback(async () => {
    try {
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

      setMarkets(marketsMap);
      setIsLoading(false);
      hasInitialDataRef.current = true;
      lastUpdateTimeRef.current = Date.now();

      // Preload metadata for all markets
      if (tickers.length > 0) {
        metadataService.preloadBatch(tickers);
      }
    } catch (err: any) {
      console.error('[useMarkets] Failed to fetch initial markets:', err);
      if (isMountedRef.current) {
        setError(err.message || 'Failed to load markets');
        setIsLoading(false);
      }
    }
  }, [enrichMarketData]);

  const handleWebSocketMessage = useCallback(
    (msg: WebSocketMessage) => {
      if (!isMountedRef.current) return;

      if (msg.type !== 'channel_data' && msg.type !== 'channel_batch_data') return;
      if (!msg.contents) return;

      // Parse market data from message
      let marketsPayload: Record<string, any> = {};

      try {
        // Handle batch data format: contents is an array of objects with oraclePrices
        if (Array.isArray(msg.contents)) {
          msg.contents.forEach((item: any) => {
            if (item.oraclePrices && typeof item.oraclePrices === 'object') {
              Object.assign(marketsPayload, item.oraclePrices);
            } else if (item.markets && typeof item.markets === 'object') {
              Object.assign(marketsPayload, item.markets);
            }
          });
        }
        // Handle single data format
        else if (msg.contents.oraclePrices && typeof msg.contents.oraclePrices === 'object') {
          marketsPayload = msg.contents.oraclePrices;
        } else if (msg.contents.markets && typeof msg.contents.markets === 'object') {
          marketsPayload = msg.contents.markets;
        }
        // Handle direct format
        else if (typeof msg.contents === 'object') {
          const keys = Object.keys(msg.contents);
          const looksLikeMarkets = keys.some(key => key.includes('-'));
          if (looksLikeMarkets) {
            marketsPayload = msg.contents;
          }
        }

        if (Object.keys(marketsPayload).length === 0) return;
      } catch (parseError) {
        console.error('[useMarkets] Error parsing message:', parseError);
        return;
      }

      lastUpdateTimeRef.current = Date.now();

      // Update markets state
      setMarkets(prev => {
        const updated = { ...prev };
        let hasChanges = false;

        Object.entries(marketsPayload).forEach(([ticker, rawData]: [string, any]) => {
          const existing = updated[ticker];

          if (existing) {
            // Check if any field actually changed
            const needsUpdate =
              existing.oraclePrice !== rawData.oraclePrice ||
              existing.volume24H !== rawData.volume24H ||
              existing.status !== rawData.status ||
              existing.trades24H !== Number(rawData.trades24H) ||
              existing.nextFundingRate !== rawData.nextFundingRate ||
              existing.openInterest !== rawData.openInterest ||
              existing.priceChange24H !== rawData.priceChange24H ||
              existing.priceChange24HPercent !== rawData.priceChange24HPercent;

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
                marketCaps: rawData.marketCaps ?? existing.marketCaps,
                marketId: rawData.marketId ?? existing.marketId,
                baseOpenInterest: rawData.baseOpenInterest ?? existing.baseOpenInterest,
                spotVolume: rawData.spotVolume ?? existing.spotVolume,
              };
              hasChanges = true;
            }
          } else {
            // New market detected - enrich it asynchronously
            enrichMarketData(ticker, rawData)
              .then(enriched => {
                if (isMountedRef.current) {
                  setMarkets(current => ({ ...current, [ticker]: enriched }));
                }
              })
              .catch(err => {
                console.error(`[useMarkets] Failed to enrich market ${ticker}:`, err);
              });
          }
        });

        return hasChanges ? updated : prev;
      });
    },
    [enrichMarketData]
  );

  const refreshMarkets = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    await fetchInitialMarketData();
  }, [fetchInitialMarketData]);

  // Main initialization effect
  useEffect(() => {
    isMountedRef.current = true;
    let removeOnConnect: (() => void) | undefined;
    let removeOnDisconnect: (() => void) | undefined;

    const initialize = async () => {
      await fetchInitialMarketData();

      if (!isMountedRef.current) return;

      const socketClient = getSocketClient();
      socketClientRef.current = socketClient;

      try {
        unsubscribeRef.current = socketClient.subscribeToMarkets(handleWebSocketMessage, true);
      } catch (err) {
        console.error('[useMarkets] Failed to subscribe:', err);
        setError('Failed to connect to market data feed');
      }

      removeOnConnect = socketClient.onConnect(() => {
        if (isMountedRef.current) {
          setIsConnected(true);
          setError(null);

          if (unsubscribeRef.current) {
            unsubscribeRef.current();
          }
          try {
            unsubscribeRef.current = socketClient.subscribeToMarkets(handleWebSocketMessage, true);
          } catch (err) {
            console.error('[useMarkets] Failed to resubscribe:', err);
          }
        }
      });

      removeOnDisconnect = socketClient.onDisconnect(() => {
        if (isMountedRef.current) {
          setIsConnected(false);
        }
      });

      setIsConnected(socketClient.isConnected());
    };

    initialize();

    return () => {
      isMountedRef.current = false;

      if (metadataUpdateTimerRef.current) {
        clearTimeout(metadataUpdateTimerRef.current);
        metadataUpdateTimerRef.current = null;
      }

      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }

      if (removeOnConnect) removeOnConnect();
      if (removeOnDisconnect) removeOnDisconnect();
    };
  }, [fetchInitialMarketData, handleWebSocketMessage]);

  // Memoized sorted markets list
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
