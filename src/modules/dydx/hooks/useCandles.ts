import { useEffect, useMemo, useRef, useState } from 'react';

import { getIndexerClient } from '../client/clients';
import { useWebSocketStore } from '../store/websocketStore';

export type CandleResolution = '1MIN' | '5MINS' | '15MINS' | '30MINS' | '1HOUR' | '4HOURS' | '1DAY';

export interface Candle {
  startedAt: string;
  ticker: string;
  resolution: string;
  low: string;
  high: string;
  open: string;
  close: string;
  baseTokenVolume: string;
  usdVolume: string;
  trades: number;
  startingOpenInterest: string;
  id: string;
}

interface UseRealtimeChartReturn {
  candles: Candle[];
  latestCandle: Candle | null;
  error: string | null;
  isLoading: boolean;
  isConnected: boolean;
}

const FETCH_DEBOUNCE_MS = 300;

export function useRealtimeChart(
  market: string = 'BTC-USD',
  resolution: CandleResolution = '1MIN',
  limit: number = 100
): UseRealtimeChartReturn {
  const enforcedLimit = Math.min(limit, 1000);

  const [snapshotCandles, setSnapshotCandles] = useState<Candle[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const subscribeToCandles = useWebSocketStore(state => state.subscribeToCandles);
  const unsubscribeFromCandles = useWebSocketStore(state => state.unsubscribeFromCandles);
  const isConnected = useWebSocketStore(state => state.isConnected);

  const mountedRef = useRef(true);

  const loadIdRef = useRef(0);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const candleKey = `candles_${market}_${resolution}`;
  const storeCandlesData = useWebSocketStore(state => state.candles.get(candleKey));

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      debounceTimerRef.current && clearTimeout(debounceTimerRef.current);
      abortControllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    setSnapshotCandles([]);
    setIsLoading(true);
    setError(null);
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    abortControllerRef.current?.abort();
    loadIdRef.current += 1;
    const myLoadId = loadIdRef.current;
    debounceTimerRef.current = setTimeout(async () => {
      if (!mountedRef.current || myLoadId !== loadIdRef.current) return;

      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const indexerClient = getIndexerClient();
        const data = await indexerClient.markets.getPerpetualMarketCandles(
          market,
          resolution,
          undefined,
          undefined,
          enforcedLimit
        );

        if (!mountedRef.current || myLoadId !== loadIdRef.current || controller.signal.aborted) {
          return;
        }

        const fetched: Candle[] = (data.candles || []).map((c: any) => ({
          startedAt: c.startedAt,
          ticker: c.ticker || market,
          resolution: c.resolution || resolution,
          low: c.low || '0',
          high: c.high || '0',
          open: c.open || '0',
          close: c.close || '0',
          baseTokenVolume: c.baseTokenVolume || '0',
          usdVolume: c.usdVolume || '0',
          trades: Number(c.trades) || 0,
          startingOpenInterest: c.startingOpenInterest || '0',
          id: c.startedAt,
        }));

        const sorted = [...fetched].sort(
          (a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime()
        );

        setSnapshotCandles(sorted);
        setError(null);
      } catch (err: any) {
        if (err?.name === 'AbortError') return;
        if (!mountedRef.current || myLoadId !== loadIdRef.current) return;

        console.error('[Candles] Load error:', err);
        setError(err instanceof Error ? err.message : 'Failed to load candles');
        setSnapshotCandles([]);
      } finally {
        if (mountedRef.current && myLoadId === loadIdRef.current) {
          setIsLoading(false);
        }
      }
    }, FETCH_DEBOUNCE_MS);

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [market, resolution, enforcedLimit]);
  useEffect(() => {
    subscribeToCandles(market, resolution);
    return () => {
      unsubscribeFromCandles(market, resolution);
    };
  }, [market, resolution, subscribeToCandles, unsubscribeFromCandles]);
  const mergedCandles = useMemo(() => {
    const liveCandles = storeCandlesData?.candles || [];

    if (liveCandles.length === 0 && snapshotCandles.length === 0) return [];

    const candleMap = new Map<string, Candle>();
    snapshotCandles.forEach(c => candleMap.set(c.startedAt, c));
    liveCandles.forEach((c: any) => {
      candleMap.set(c.startedAt, {
        startedAt: c.startedAt,
        ticker: c.ticker || market,
        resolution: c.resolution || resolution,
        low: c.low || '0',
        high: c.high || '0',
        open: c.open || '0',
        close: c.close || '0',
        baseTokenVolume: c.baseTokenVolume || '0',
        usdVolume: c.usdVolume || '0',
        trades: Number(c.trades) || 0,
        startingOpenInterest: c.startingOpenInterest || '0',
        id: c.startedAt,
      });
    });

    const merged = Array.from(candleMap.values());
    merged.sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime());
    return merged.slice(-enforcedLimit);
  }, [snapshotCandles, storeCandlesData, enforcedLimit, market, resolution]);

  const latestCandle = useMemo(() => {
    if (mergedCandles.length === 0) return null;
    return mergedCandles[mergedCandles.length - 1];
  }, [mergedCandles]);

  return {
    candles: mergedCandles,
    latestCandle,
    error,
    isLoading,
    isConnected,
  };
}
