import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { getIndexerClient, getValidatorClient } from '../client/clients';
import useMarketStore from '../store/marketStore';
import { useWebSocketStore } from '../store/websocketStore';
import type { MarketData } from '../types/trading.types';
import { metadataService } from './useMetadata';
import coinsList from '../data/coins.json';

// ... (imports)



export type { MarketData };

export interface UseMarketsReturn {
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
  const [cacheStats, setCacheStats] = useState(metadataService.getCacheStats());

  const isMountedRef = useRef(true);
  const hasInitialDataRef = useRef(false);
  const metadataUpdateTimerRef = useRef<NodeJS.Timeout | null>(null);
  const metadataUpdateCounterRef = useRef(0);

  const subscribeToAllMarkets = useWebSocketStore(state => state.subscribeToAllMarkets);
  const unsubscribeFromAllMarkets = useWebSocketStore(state => state.unsubscribeFromAllMarkets);
  const isConnected = useWebSocketStore(state => state.isConnected);
  const storeMarkets = useWebSocketStore(state => state.markets);

  useEffect(() => {
    const unsubscribe = metadataService.subscribe(() => {
      setCacheStats(metadataService.getCacheStats());

      if (metadataUpdateTimerRef.current) clearTimeout(metadataUpdateTimerRef.current);

      metadataUpdateCounterRef.current++;
      const currentCount = metadataUpdateCounterRef.current;

      metadataUpdateTimerRef.current = setTimeout(async () => {
        if (currentCount === metadataUpdateCounterRef.current && isMountedRef.current) {
          const tickers = Object.keys(markets);
          const metadataPromises = tickers.map(ticker => metadataService.getMetadata(ticker));
          const metadataResults = await Promise.all(metadataPromises);

          setMarkets(prev => {
            const updated = { ...prev };
            let hasChanges = false;

            tickers.forEach((ticker, index) => {
              const metadata = metadataResults[index];
              if (metadata && metadata.image !== updated[ticker]?.coinIcon) {
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

  useEffect(() => {
    if (storeMarkets.size === 0) return;

    setMarkets(prev => {
      const updated = { ...prev };
      let hasChanges = false;

      storeMarkets.forEach((marketData, ticker) => {
        const existing = updated[ticker];
        if (existing) {
          const needsUpdate =
            existing.oraclePrice !== marketData.oraclePrice ||
            existing.volume24H !== marketData.volume24H ||
            existing.nextFundingRate !== marketData.nextFundingRate ||
            existing.openInterest !== marketData.openInterest ||
            existing.priceChange24H !== marketData.priceChange24H;

          if (needsUpdate) {
            updated[ticker] = {
              ...existing,
              oraclePrice: marketData.oraclePrice ?? existing.oraclePrice,
              priceChange24H: marketData.priceChange24H ?? existing.priceChange24H,
              volume24H: marketData.volume24H ?? existing.volume24H,
              nextFundingRate: marketData.nextFundingRate ?? existing.nextFundingRate,
              openInterest: marketData.openInterest ?? existing.openInterest,
            };
            hasChanges = true;
          }
        }
      });

      return hasChanges ? updated : prev;
    });
  }, [storeMarkets]);

  const enrichMarketData = useCallback(
    async (ticker: string, rawData: any, zeroFeeClobPairIds: Set<number>): Promise<MarketData> => {
      const metadata = await metadataService.getMetadata(ticker);
      const baseAsset = ticker.split('-')[0];
      const quoteAsset = ticker.split('-')[1] || 'USD';
      const staticCoin = (coinsList as any[]).find(c => c.symbol.toUpperCase() === baseAsset);
      const marketCap = staticCoin?.market_cap ? staticCoin.market_cap.toString() : '0';

      const clobPairId = Number(rawData.clobPairId);
      const isZeroFees = zeroFeeClobPairIds.has(clobPairId);

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
        coinName: metadata?.name ?? staticCoin?.name,
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
        marketCap: marketCap,
        zeroFees: isZeroFees
      };
    },
    []
  );

  const fetchInitialMarketData = useCallback(async () => {
    try {
      const indexerClient = getIndexerClient();
      const validatorClient = await getValidatorClient();

      const [marketsResponse, feeDiscountsResponse] = await Promise.all([
        indexerClient.markets.getPerpetualMarkets(),
        validatorClient.get.getAllPerpMarketFeeDiscounts().catch((err: any) => {
          console.error('[useMarkets] Failed to fetch fee discounts:', err);
          return { params: [] };
        })
      ]);

      if (!isMountedRef.current) return;

      const zeroFeeClobPairIds = new Set<number>();
      if (feeDiscountsResponse?.params) {
        feeDiscountsResponse.params.forEach((param: any) => {
          if (param.chargePpm === 0) {
            zeroFeeClobPairIds.add(param.clobPairId);
          }
        });
      }

      const marketsMap: Record<string, MarketData> = {};
      const tickers: string[] = [];

      if (marketsResponse?.markets) {
        for (const [ticker, rawData] of Object.entries(marketsResponse.markets)) {
          tickers.push(ticker);
          marketsMap[ticker] = await enrichMarketData(ticker, rawData, zeroFeeClobPairIds);
        }
      }

      setMarkets(marketsMap);
      setIsLoading(false);
      hasInitialDataRef.current = true;
      useMarketStore.getState().updateMarketCache(marketsMap);

      if (tickers.length > 0) {
        metadataService.preloadBatch(tickers);
      }

      subscribeToAllMarkets();
    } catch (err: unknown) {
      console.error('[useMarkets] Failed to fetch initial markets:', err);
      if (isMountedRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to load markets');
        setIsLoading(false);
      }
    }
  }, [enrichMarketData, subscribeToAllMarkets]);

  const refreshMarkets = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    await fetchInitialMarketData();
  }, [fetchInitialMarketData]);


  useEffect(() => {
    isMountedRef.current = true;

    fetchInitialMarketData();

    return () => {
      isMountedRef.current = false;

      if (metadataUpdateTimerRef.current) {
        clearTimeout(metadataUpdateTimerRef.current);
        metadataUpdateTimerRef.current = null;
      }
      unsubscribeFromAllMarkets();
    };
  }, [fetchInitialMarketData, unsubscribeFromAllMarkets]);

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
