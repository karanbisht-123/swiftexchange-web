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
  isFetchingMore: boolean;
  isConnected: boolean;
  fetchMore: () => Promise<void>;
}

const FETCH_DEBOUNCE_MS = 300;

export function useRealtimeChart(
  market: string = 'BTC-USD',
  resolution: CandleResolution = '1MIN',
  limit: number = 100
): UseRealtimeChartReturn {
  const enforcedLimit = Math.min(limit, 1000);

  const [historicalCandles, setHistoricalCandles] = useState<Candle[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isFetchingMore, setIsFetchingMore] = useState(false);

  const subscribeToCandles = useWebSocketStore(state => state.subscribeToCandles);
  const unsubscribeFromCandles = useWebSocketStore(state => state.unsubscribeFromCandles);
  const isConnected = useWebSocketStore(state => state.isConnected);

  const mountedRef = useRef(true);
  const loadIdRef = useRef(0);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const candleKey = `candles_${market}_${resolution}`;
  const storeCandlesData = useWebSocketStore(state => state.candles.get(candleKey));

  // Pagination state refs
  const oldestTimestampRef = useRef<string | null>(null);
  const hasMoreRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      debounceTimerRef.current && clearTimeout(debounceTimerRef.current);
      abortControllerRef.current?.abort();
    };
  }, []);

  const fetchCandles = async (isInitial = true) => {
    if (!mountedRef.current) return;
    if (!isInitial && (!hasMoreRef.current || isFetchingMore)) return;

    if (isInitial) {
      setIsLoading(true);
      oldestTimestampRef.current = null;
      hasMoreRef.current = true;
    } else {
      setIsFetchingMore(true);
    }

    try {
      const indexerClient = getIndexerClient();
      const toISO = isInitial ? undefined : oldestTimestampRef.current;
      
      const data = await indexerClient.markets.getPerpetualMarketCandles(
        market,
        resolution,
        undefined, // fromISO
        toISO || undefined, // toISO
        enforcedLimit
      );

      if (!mountedRef.current) return;

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

      if (fetched.length === 0) {
        hasMoreRef.current = false;
        return;
      }

      // Update oldest timestamp for next fetch
      const sortedFetched = [...fetched].sort(
        (a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime()
      );
      oldestTimestampRef.current = sortedFetched[0].startedAt;

      // If we got fewer candles than requested, we likely hit the end of history
      if (fetched.length < enforcedLimit) {
        hasMoreRef.current = false;
      }

      setHistoricalCandles(prev => {
        if (isInitial) return sortedFetched;
        
        // Merge and deduplicate
        const candleMap = new Map<string, Candle>();
        prev.forEach(c => candleMap.set(c.startedAt, c));
        sortedFetched.forEach(c => candleMap.set(c.startedAt, c));
        
        return Array.from(candleMap.values()).sort(
          (a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime()
        );
      });

      setError(null);
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      console.error('[Candles] Load error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load candles');
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
        setIsFetchingMore(false);
      }
    }
  };

  useEffect(() => {
    // DO NOT clear historicalCandles here; this prevents the chart from blinking away.
    // The old candles remain displayed behind the loader until the new candles are completely fetched.
    setIsLoading(true);
    setError(null);
    hasMoreRef.current = true;
    oldestTimestampRef.current = null;

    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    abortControllerRef.current?.abort();
    
    loadIdRef.current += 1;
    const myLoadId = loadIdRef.current;

    debounceTimerRef.current = setTimeout(async () => {
      if (!mountedRef.current || myLoadId !== loadIdRef.current) return;
      fetchCandles(true);
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

    if (liveCandles.length === 0 && historicalCandles.length === 0) return [];

    const candleMap = new Map<string, Candle>();
    
    // Add historical candles first
    historicalCandles.forEach(c => candleMap.set(c.startedAt, c));
    
    // Merge with live candles from socket
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
    
    // Safety cap to prevent memory issues in extremely long sessions
    return merged.slice(-5000);
  }, [historicalCandles, storeCandlesData, market, resolution]);

  const latestCandle = useMemo(() => {
    if (mergedCandles.length === 0) return null;
    return mergedCandles[mergedCandles.length - 1];
  }, [mergedCandles]);

  return {
    candles: mergedCandles,
    latestCandle,
    error,
    isLoading,
    isFetchingMore,
    isConnected,
    fetchMore: () => fetchCandles(false),
  };
}
