import { useEffect, useRef, useState } from 'react';

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

interface UseCandlesReturn {
  candles: Candle[];
  latestCandle: Candle | null;
  error: string | null;
  isLoading: boolean;
  isConnected: boolean;
}

export function useCandles(
  market: string = 'BTC-USD',
  resolution: CandleResolution = '1MIN',
  limit: number = 100,
  pollInterval: number = 30000
): UseCandlesReturn {
  const [candles, setCandles] = useState<Candle[]>([]);
  const [latestCandle, setLatestCandle] = useState<Candle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isConnected, setIsConnected] = useState(false);

  const unsubscribeRef = useRef<(() => void) | null>(null);
  const isMountedRef = useRef(true);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastResolutionRef = useRef(resolution); // Track last resolution to detect changes

  // Function to fetch candles from REST API
  const fetchCandles = async () => {
    try {
      const { getIndexerClient } = await import('../client/clients');
      const indexerClient = getIndexerClient();

      const data = await indexerClient.markets.getPerpetualMarketCandles(
        market,
        resolution,
        undefined,
        undefined,
        limit
      );

      if (!isMountedRef.current) return;

      const fetchedCandles = data.candles || [];
      // Only update state if resolution hasn't changed during fetch
      if (resolution === lastResolutionRef.current) {
        setCandles(fetchedCandles);
        setLatestCandle(fetchedCandles.length > 0 ? fetchedCandles[0] : null);
        setError(null);
        console.log(`[useCandles] Fetched ${fetchedCandles.length} candles via REST API`);
      }
    } catch (err: any) {
      console.error('[useCandles] REST API fetch error:', err);
      if (isMountedRef.current && resolution === lastResolutionRef.current) {
        setError(err.message || 'Failed to fetch candles from API');
      }
    }
  };

  useEffect(() => {
    isMountedRef.current = true;
    lastResolutionRef.current = resolution; // Update resolution tracking
    let socketClient: any = null;

    const initializeConnection = async () => {
      try {
        const { getSocketClient } = await import('../client/clients');
        socketClient = getSocketClient();

        console.log(`[useCandles] Initializing for ${market} - ${resolution}`);

        // Fetch initial candles
        setIsLoading(true);
        await fetchCandles();
        setIsLoading(false);

        // Attempt WebSocket connection
        await socketClient.connect();
        if (!isMountedRef.current) return;
        setIsConnected(true);

        // Subscribe to real-time candle updates
        const handleMessage = (msg: WebSocketMessage) => {
          if (!isMountedRef.current || resolution !== lastResolutionRef.current) return;

          console.log('[useCandles] WS message:', {
            type: msg.type,
            channel: msg.channel,
            id: msg.id,
          });

          if (msg.type !== 'channel_data' || !msg.contents) return;

          const newCandle = msg.contents as Candle;

          setCandles(prev => {
            const existingIndex = prev.findIndex(c => c.startedAt === newCandle.startedAt);

            if (existingIndex !== -1) {
              const updated = [...prev];
              updated[existingIndex] = newCandle;
              return updated;
            } else {
              return [newCandle, ...prev].slice(0, limit);
            }
          });

          setLatestCandle(newCandle);
        };

        const candleId = `${market}/${resolution}`;
        unsubscribeRef.current = socketClient.subscribeToCandles(market, resolution, handleMessage);
        console.log(`[useCandles] Subscribed to ${candleId}`);

        const onConnectCleanup = socketClient.onConnect(() => {
          if (isMountedRef.current) {
            console.log('[useCandles] WebSocket connected');
            setIsConnected(true);
            setError(null);
            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current);
              pollIntervalRef.current = null;
            }
          }
        });

        const onDisconnectCleanup = socketClient.onDisconnect(() => {
          if (isMountedRef.current) {
            console.log('[useCandles] WebSocket disconnected');
            setIsConnected(false);
            if (!pollIntervalRef.current) {
              pollIntervalRef.current = setInterval(fetchCandles, pollInterval);
              console.log('[useCandles] Started polling due to WebSocket disconnect');
            }
          }
        });

        return () => {
          onConnectCleanup();
          onDisconnectCleanup();
        };
      } catch (err: any) {
        console.error('[useCandles] Initialization error:', err);
        if (isMountedRef.current) {
          setError(err.message || 'Failed to initialize WebSocket');
          setIsConnected(false);
          setIsLoading(false);
          if (!pollIntervalRef.current) {
            pollIntervalRef.current = setInterval(fetchCandles, pollInterval);
            console.log('[useCandles] Started polling due to initialization error');
          }
        }
      }
    };

    const cleanupPromise = initializeConnection();

    return () => {
      isMountedRef.current = false;
      console.log(`[useCandles] Cleaning up ${market} - ${resolution}`);

      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }

      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }

      cleanupPromise.then(cleanup => {
        if (cleanup) cleanup();
      });
    };
  }, [market, resolution, limit, pollInterval]);

  return {
    candles,
    latestCandle,
    error,
    isLoading,
    isConnected,
  };
}
