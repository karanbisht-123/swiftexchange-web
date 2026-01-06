import { useEffect, useRef, useState } from 'react';

import { getIndexerClient, getSocketClient } from '../client/clients';
import type { WebSocketMessage } from '../utils/WebSocketManager';

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
  const [candles, setCandles] = useState<Candle[]>([]);
  const [latestCandle, setLatestCandle] = useState<Candle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isConnected, setIsConnected] = useState(false);

  const mountedRef = useRef(true);
  const currentMarketRef = useRef(market);
  const currentResolutionRef = useRef(resolution);
  const candleUnsubRef = useRef<(() => void) | null>(null);
  const messageCountRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    currentMarketRef.current = market;
    currentResolutionRef.current = resolution;
    messageCountRef.current = 0;

    setCandles([]);
    setLatestCandle(null);
    setIsLoading(true);
    setIsConnected(false);
    setError(null);

    if (candleUnsubRef.current) {
      candleUnsubRef.current();
      candleUnsubRef.current = null;
    }

    const socketClient = getSocketClient();

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
          !mountedRef.current ||
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

          setCandles(sortedCandles);
          setLatestCandle(sortedCandles[sortedCandles.length - 1]);
        }

        setIsLoading(false);
      } catch (err: any) {
        if (mountedRef.current && currentMarketRef.current === market) {
          setError(err.message || 'Failed to load initial candles');
          setIsLoading(false);
        }
      }
    };

    const handleCandleMessage = (msg: WebSocketMessage) => {
      messageCountRef.current++;

      if (
        !mountedRef.current ||
        currentMarketRef.current !== market ||
        currentResolutionRef.current !== resolution
      ) {
        return;
      }

      if (msg.type !== 'channel_data' && msg.type !== 'channel_batch_data') {
        return;
      }

      if (!msg.contents) {
        return;
      }

      const newCandles = Array.isArray(msg.contents) ? msg.contents : [msg.contents];

      newCandles.forEach((newCandle: Candle) => {
        setCandles(prev => {
          const existingIndex = prev.findIndex(c => c.startedAt === newCandle.startedAt);

          let updated: Candle[];

          if (existingIndex !== -1) {
            updated = [...prev];
            updated[existingIndex] = newCandle;
          } else {
            updated = [...prev, newCandle];
            updated.sort(
              (a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime()
            );

            if (updated.length > limit) {
              updated = updated.slice(-limit);
            }
          }

          setLatestCandle(updated[updated.length - 1]);

          return updated;
        });
      });
    };

    try {
      candleUnsubRef.current = socketClient.subscribeToCandles(
        market,
        resolution,
        handleCandleMessage,
        true
      );
    } catch (err) {
      if (mountedRef.current) {
        setError('Failed to subscribe to candle updates');
      }
    }

    setIsConnected(socketClient.isConnected());

    const removeOnConnect = socketClient.onConnect(() => {
      if (mountedRef.current) {
        setIsConnected(true);
        setError(null);
      }
    });

    const removeOnDisconnect = socketClient.onDisconnect(() => {
      if (mountedRef.current) {
        setIsConnected(false);
      }
    });

    initCandles();

    return () => {
      mountedRef.current = false;

      if (candleUnsubRef.current) {
        candleUnsubRef.current();
        candleUnsubRef.current = null;
      }

      removeOnConnect();
      removeOnDisconnect();
    };
  }, [market, resolution, limit]);

  return {
    candles,
    latestCandle,
    error,
    isLoading,
    isConnected,
  };
}
