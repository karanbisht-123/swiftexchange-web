import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import coinsList from '../data/coins.json';
import useMarketStore from '../store/marketStore';
import { useWebSocketStore } from '../store/websocketStore';
import type { MarketData as WsMarketData } from '../store/websocketStore';
import type { MarketData } from '../types/trading.types';
import { getValidatorClient } from '../client/clients';
import { metadataService } from './useMetadata';

export type { MarketData };

export interface UseMarketsReturn {
  markets: Record<string, MarketData>;
  marketsList: MarketData[];
  getMarket: (ticker: string) => MarketData | undefined;
  error: string | null;
  isLoading: boolean;
  isConnected: boolean;
  totalMarkets: number;
  refreshMarkets: () => void;
  cacheStats: ReturnType<typeof metadataService.getCacheStats>;
}

const METADATA_UPDATE_DEBOUNCE = 500;
function buildMarketData(
  ticker: string,
  ws: WsMarketData,
  coinIconOverride: string,
  coinNameOverride: string,
  marketCapOverride: string,
  zeroFees: boolean
): MarketData {
  const baseAsset = ticker.split('-')[0];
  const quoteAsset = ticker.split('-')[1] || 'USD';

  return {
    ticker,
    baseAsset,
    quoteAsset,
    oraclePrice: ws.oraclePrice ?? '0',
    priceChange24H: ws.priceChange24H ?? '0',
    priceChange24HPercent: ws.priceChange24HPercent ?? '0',
    volume24H: ws.volume24H ?? '0',
    trades24H: Number(ws.trades24H) || 0,
    nextFundingRate: ws.nextFundingRate ?? '0',
    nextFundingAt: ws.nextFundingAt ?? '',
    openInterest: ws.openInterest ?? '0',
    status: ws.status || 'ACTIVE',
    marketId: ws.marketId !== undefined ? Number(ws.marketId) : undefined,
    clobPairId: ws.clobPairId,
    initialMarginFraction: ws.initialMarginFraction,
    maintenanceMarginFraction: ws.maintenanceMarginFraction,
    tickSize: ws.tickSize,
    stepSize: ws.stepSize,
    atomicResolution: ws.atomicResolution,
    quantumConversionExponent: ws.quantumConversionExponent,
    stepBaseQuantums: ws.stepBaseQuantums,
    subticksPerTick: ws.subticksPerTick,
    marketType: ws.marketType ?? 'CROSS',
    openInterestLowerCap: ws.openInterestLowerCap,
    openInterestUpperCap: ws.openInterestUpperCap,
    baseOpenInterest: ws.baseOpenInterest,
    defaultFundingRate1H: ws.defaultFundingRate1H,
    coinIcon: coinIconOverride,
    coinName: coinNameOverride,
    marketCap: marketCapOverride,
    zeroFees,
    spotVolume: undefined,
    marketCaps: undefined,
  };
}

export function useMarkets(): UseMarketsReturn {
  const [markets, setMarkets] = useState<Record<string, MarketData>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [zeroFeeClobPairIds, setZeroFeeClobPairIds] = useState<Set<number>>(new Set());
  const [cacheStats, setCacheStats] = useState(metadataService.getCacheStats());

  const isMountedRef = useRef(true);
  const metadataUpdateTimerRef = useRef<NodeJS.Timeout | null>(null);
  const metadataUpdateCounterRef = useRef(0);

  const subscribeToAllMarkets = useWebSocketStore(state => state.subscribeToAllMarkets);
  const unsubscribeFromAllMarkets = useWebSocketStore(state => state.unsubscribeFromAllMarkets);
  const isConnected = useWebSocketStore(state => state.isConnected);
  const storeMarkets = useWebSocketStore(state => state.markets);
  const marketsSnapshot = useWebSocketStore(state => state.marketsSnapshot);
  useEffect(() => {
    isMountedRef.current = true;
    subscribeToAllMarkets();

    const fetchFeeDiscounts = async () => {
      try {
        const validatorClient = await getValidatorClient();
        const feeDiscountsResponse = await validatorClient.get
          .getAllPerpMarketFeeDiscounts()
          .catch((err: any) => {
            console.error('[useMarkets] Failed to fetch fee discounts:', err);
            return { params: [] };
          });

        if (!isMountedRef.current) return;

        const zeroFeeIds = new Set<number>();
        const now = Date.now();
        if (feeDiscountsResponse?.params) {
          console.log('[useMarkets] Fee discounts fetched:', feeDiscountsResponse.params);
          feeDiscountsResponse.params.forEach((param: any) => {
            const start = new Date(param.startTime).getTime();
            const end = new Date(param.endTime).getTime();

            if (param.chargePpm === 0 && now >= start && now <= end) {
              zeroFeeIds.add(param.clobPairId);
            }
          });
        }
        setZeroFeeClobPairIds(zeroFeeIds);
      } catch (error) {
        console.error('[useMarkets] Error in fetchFeeDiscounts:', error);
      }
    };

    fetchFeeDiscounts();

    return () => {
      isMountedRef.current = false;
      if (metadataUpdateTimerRef.current) clearTimeout(metadataUpdateTimerRef.current);
      unsubscribeFromAllMarkets();
    };
  }, [subscribeToAllMarkets, unsubscribeFromAllMarkets]);
  useEffect(() => {
    if (!marketsSnapshot || marketsSnapshot.size === 0) return;
    if (!isMountedRef.current) return;

    const buildAll = async () => {
      const marketsMap: Record<string, MarketData> = {};

      for (const [ticker, ws] of marketsSnapshot.entries()) {
        const baseAsset = ticker.split('-')[0];
        const staticCoin = (coinsList as any[]).find(
          c => c.symbol?.toUpperCase() === baseAsset
        );
        const coinIcon = metadataService.getCoinIcon(ticker) || staticCoin?.image || '';
        const coinName = staticCoin?.name ?? baseAsset;
        const marketCap = staticCoin?.market_cap?.toString() ?? '0';
        const isZeroFee = ws.clobPairId !== undefined && zeroFeeClobPairIds.has(Number(ws.clobPairId));

        marketsMap[ticker] = buildMarketData(ticker, ws, coinIcon, coinName, marketCap, isZeroFee);
      }
      if (!isMountedRef.current) return;
      setMarkets(marketsMap);
      setIsLoading(false);
      useMarketStore.getState().updateMarketCache(marketsMap);
      const oracleSeed: Record<string, string> = {};
      const imfSeed: Record<string, Partial<WsMarketData>> = {};
      for (const [ticker, market] of Object.entries(marketsMap)) {
        if (market.oraclePrice && market.oraclePrice !== '0') {
          oracleSeed[ticker] = market.oraclePrice;
        }
        if (market.initialMarginFraction) {
          imfSeed[ticker] = { initialMarginFraction: market.initialMarginFraction };
        }
      }
      if (Object.keys(oracleSeed).length > 0) {
        useWebSocketStore.getState().updateOraclePrices(oracleSeed);
      }
      if (Object.keys(imfSeed).length > 0) {
        useWebSocketStore.getState().updateMarkets(imfSeed as any);
      }
      metadataService.preloadBatch(Object.keys(marketsMap));
    };

    buildAll();
  }, [marketsSnapshot, zeroFeeClobPairIds]);

  useEffect(() => {
    if (storeMarkets.size === 0) return;

    setMarkets(prev => {
      const updated = { ...prev };
      let hasChanges = false;

      storeMarkets.forEach((marketData, ticker) => {
        const existing = updated[ticker];
        if (!existing) return;

        const needsUpdate =
          existing.oraclePrice !== marketData.oraclePrice ||
          existing.volume24H !== marketData.volume24H ||
          existing.nextFundingRate !== marketData.nextFundingRate ||
          existing.openInterest !== marketData.openInterest ||
          existing.priceChange24H !== marketData.priceChange24H;

        if (needsUpdate) {
          updated[ticker] = {
            ...existing,
            oraclePrice: marketData.oraclePrice || existing.oraclePrice,
            priceChange24H: marketData.priceChange24H || existing.priceChange24H,
            volume24H: marketData.volume24H || existing.volume24H,
            nextFundingRate: marketData.nextFundingRate || existing.nextFundingRate,
            openInterest: marketData.openInterest || existing.openInterest,
          };
          hasChanges = true;
        }
      });

      return hasChanges ? updated : prev;
    });
  }, [storeMarkets]);

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
            const next = { ...prev };
            let hasChanges = false;

            tickers.forEach((ticker, index) => {
              const metadata = metadataResults[index];
              if (metadata && metadata.image !== next[ticker]?.coinIcon) {
                next[ticker] = {
                  ...next[ticker],
                  coinIcon: metadata.image,
                  coinName: metadata.name,
                };
                hasChanges = true;
              }
            });

            return hasChanges ? next : prev;
          });
        }
      }, METADATA_UPDATE_DEBOUNCE);
    });

    return () => {
      unsubscribe();
      if (metadataUpdateTimerRef.current) clearTimeout(metadataUpdateTimerRef.current);
    };
  }, []);

  const refreshMarkets = useCallback(() => {
    setIsLoading(true);
    unsubscribeFromAllMarkets();

    setTimeout(() => {
      if (isMountedRef.current) subscribeToAllMarkets();
    }, 500);
  }, [subscribeToAllMarkets, unsubscribeFromAllMarkets]);

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
    error: null,
    isLoading,
    isConnected,
    totalMarkets: marketsList.length,
    refreshMarkets,
    cacheStats,
  };
}