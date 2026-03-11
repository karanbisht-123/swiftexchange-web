import { useEffect, useMemo, useRef, useState } from 'react';

import { getIndexerClient } from '../client/clients';
import { useWebSocketStore } from '../store/websocketStore';
import { useTrades } from './useTrades';

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
  // dYdX Indexer API enforces a maximum limit of 1000
  const enforcedLimit = Math.min(limit, 1000);
  const [snapshotCandles, setSnapshotCandles] = useState<Candle[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const subscribeToCandles = useWebSocketStore(state => state.subscribeToCandles);
  const unsubscribeFromCandles = useWebSocketStore(state => state.unsubscribeFromCandles);
  const isConnected = useWebSocketStore(state => state.isConnected);

  const prevConnectedRef = useRef<boolean>(false);
  const prevMarketRef = useRef<string>(market);
  const prevResolutionRef = useRef<CandleResolution>(resolution);
  const mountedRef = useRef(true);

  const candleKey = `candles_${market}_${resolution}`;
  const storeCandlesData = useWebSocketStore(state => state.candles.get(candleKey));

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    let mounted = true;

    const isReconnect = !prevConnectedRef.current && isConnected;
    const isParamChange = prevMarketRef.current !== market || prevResolutionRef.current !== resolution;

    prevConnectedRef.current = isConnected;
    prevMarketRef.current = market;
    prevResolutionRef.current = resolution;

    if (isParamChange) {
      setSnapshotCandles([]);
      setIsLoading(true);
      setError(null);
    } else if (isReconnect) {
      setIsLoading(true);
      setError(null);
    }

    const loadCandles = async () => {
      try {
        const indexerClient = getIndexerClient();
        const data = await indexerClient.markets.getPerpetualMarketCandles(
          market,
          resolution,
          undefined,
          undefined,
          enforcedLimit
        );

        if (!mounted) return;

        const fetched = data.candles || [];

        if (fetched.length > 0) {
          const sorted = [...fetched].sort(
            (a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime()
          );
          setSnapshotCandles(sorted);
        } else {
          setSnapshotCandles([]);
        }

        setIsLoading(false);
        setError(null);
      } catch (err) {
        if (!mounted) return;
        console.error('[Candles] Load error:', err);
        setError(err instanceof Error ? err.message : 'Failed to load candles');
        setIsLoading(false);
      }
    };

    loadCandles();

    return () => {
      mounted = false;
    };
  }, [market, resolution, enforcedLimit, isConnected]);

  useEffect(() => {
    subscribeToCandles(market, resolution);

    return () => {
      unsubscribeFromCandles(market, resolution);
    };
  }, [market, resolution, subscribeToCandles, unsubscribeFromCandles]);

  const { trades } = useTrades(market, 50);

  const mergedCandles = useMemo(() => {
    const liveCandles = storeCandlesData?.candles || [];

    if (liveCandles.length === 0 && snapshotCandles.length === 0) {
      return [];
    }

    const candleMap = new Map<string, Candle>();

    snapshotCandles.forEach(c => {
      candleMap.set(c.startedAt, c);
    });

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
    const current = { ...mergedCandles[mergedCandles.length - 1] };

    if (trades.length > 0) {
      const currentCandleTime = new Date(current.startedAt).getTime();
      let addedVolume = 0;
      let latestPrice = current.close;
      let newHigh = parseFloat(current.high);
      let newLow = parseFloat(current.low);
      let hasValidTrade = false;
      for (const trade of trades) {
        const tradeTime = new Date(trade.createdAt).getTime();
        if (tradeTime >= currentCandleTime) {
          const price = parseFloat(trade.price);
          const size = parseFloat(trade.size);

          if (!hasValidTrade) {
            latestPrice = trade.price;
            hasValidTrade = true;
          }

          if (price > newHigh) newHigh = price;
          if (price < newLow) newLow = price;
          addedVolume += (price * size);
        }
      }

      if (hasValidTrade) {
        current.close = latestPrice;
        current.high = newHigh.toString();
        current.low = newLow.toString();
      }
    }

    return current;
  }, [mergedCandles, trades]);

  return {
    candles: mergedCandles,
    latestCandle,
    error,
    isLoading,
    isConnected,
  };
}
