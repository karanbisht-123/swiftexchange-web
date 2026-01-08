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

export function useRealtimeChart(
  market: string = 'BTC-USD',
  resolution: CandleResolution = '1MIN',
  limit: number = 100
): UseRealtimeChartReturn {
  const [snapshotCandles, setSnapshotCandles] = useState<Candle[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const mountedRef = useRef(true);
  const currentMarketRef = useRef(market);
  const currentResolutionRef = useRef(resolution);

  // Get store methods and state
  const subscribeToCandles = useWebSocketStore(state => state.subscribeToCandles);
  const unsubscribeFromCandles = useWebSocketStore(state => state.unsubscribeFromCandles);
  const isConnected = useWebSocketStore(state => state.isConnected);

  const candleKey = `candles_${market}_${resolution}`;
  const storeCandlesData = useWebSocketStore(state => state.candles.get(candleKey));

  // Load initial snapshot from REST API
  useEffect(() => {
    let isActive = true;
    mountedRef.current = true;
    currentMarketRef.current = market;
    currentResolutionRef.current = resolution;

    setSnapshotCandles([]);
    setIsLoading(true);
    setError(null);

    const initCandles = async () => {
      try {
        const indexerClient = getIndexerClient();
        const data = await indexerClient.markets.getPerpetualMarketCandles(
          market,
          resolution,
          undefined,
          undefined,
          limit
        );

        if (
          !isActive ||
          currentMarketRef.current !== market ||
          currentResolutionRef.current !== resolution
        ) {
          return;
        }

        const fetchedCandles = data.candles || [];

        if (fetchedCandles.length > 0) {
          const sortedCandles = [...fetchedCandles].sort(
            (a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime()
          );

          setSnapshotCandles(sortedCandles);
        }

        setIsLoading(false);
      } catch (err: unknown) {
        if (isActive && mountedRef.current && currentMarketRef.current === market) {
          setError(err instanceof Error ? err.message : 'Failed to load initial candles');
          setIsLoading(false);
        }
      }
    };

    initCandles();

    return () => {
      isActive = false;
    };
  }, [market, resolution, limit]);

  // Subscribe to WebSocket updates via store
  useEffect(() => {
    currentMarketRef.current = market;
    currentResolutionRef.current = resolution;

    // Subscribe to candles for this market/resolution
    subscribeToCandles(market, resolution);

    return () => {
      unsubscribeFromCandles(market, resolution);
    };
  }, [market, resolution, subscribeToCandles, unsubscribeFromCandles]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Merge snapshot and live candles
  const candles = useMemo(() => {
    const liveCandles = storeCandlesData?.candles || [];

    if (liveCandles.length === 0) {
      return snapshotCandles;
    }

    // Merge live candles with snapshot
    const candleMap = new Map<string, Candle>();

    // Add snapshot candles first
    snapshotCandles.forEach(c => {
      candleMap.set(c.startedAt, c);
    });

    // Override/add with live candles
    liveCandles.forEach((c: any) => {
      candleMap.set(c.startedAt, {
        startedAt: c.startedAt,
        ticker: c.ticker || '',
        resolution: c.resolution || '',
        low: c.low || '0',
        high: c.high || '0',
        open: c.open || '0',
        close: c.close || '0',
        baseTokenVolume: c.baseTokenVolume || '0',
        usdVolume: c.usdVolume || '0',
        trades: Number(c.trades) || 0,
        startingOpenInterest: c.startingOpenInterest || '0',
        id: c.startedAt, // Use startedAt as id if not provided
      });
    });

    // Convert back to sorted array
    const merged = Array.from(candleMap.values());
    merged.sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime());

    // Limit to most recent candles
    if (merged.length > limit) {
      return merged.slice(-limit);
    }

    return merged;
  }, [snapshotCandles, storeCandlesData, limit]);

  // Derive latest candle
  const latestCandle = useMemo(() => {
    if (candles.length > 0) {
      return candles[candles.length - 1];
    }
    return null;
  }, [candles]);

  return {
    candles,
    latestCandle,
    error,
    isLoading,
    isConnected,
  };
}
