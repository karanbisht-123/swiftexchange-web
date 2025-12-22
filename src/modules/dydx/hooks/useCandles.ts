import { useCallback, useEffect, useRef, useState } from 'react';

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

interface Trade {
  id: string;
  side: 'BUY' | 'SELL';
  size: string;
  price: string;
  createdAt: string;
}

interface UseRealtimeChartReturn {
  candles: Candle[];
  latestCandle: Candle | null;
  livePrice: number | null;
  livePriceSide: 'BUY' | 'SELL' | null;
  error: string | null;
  isLoading: boolean;
  isConnected: boolean;
}

const RESOLUTION_TO_MS: Record<CandleResolution, number> = {
  '1MIN': 60 * 1000,
  '5MINS': 5 * 60 * 1000,
  '15MINS': 15 * 60 * 1000,
  '30MINS': 30 * 60 * 1000,
  '1HOUR': 60 * 60 * 1000,
  '4HOURS': 4 * 60 * 60 * 1000,
  '1DAY': 24 * 60 * 60 * 1000,
};

export function useRealtimeChart(
  market: string = 'BTC-USD',
  resolution: CandleResolution = '1MIN',
  limit: number = 100
): UseRealtimeChartReturn {
  const [candles, setCandles] = useState<Candle[]>([]);
  const [latestCandle, setLatestCandle] = useState<Candle | null>(null);
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [livePriceSide, setLivePriceSide] = useState<'BUY' | 'SELL' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isConnected, setIsConnected] = useState(false);

  const mountedRef = useRef(true);
  const currentMarketRef = useRef(market);
  const currentResolutionRef = useRef(resolution);
  const candleUnsubRef = useRef<(() => void) | null>(null);
  const tradeUnsubRef = useRef<(() => void) | null>(null);
  const liveCandleRef = useRef<Candle | null>(null);
  const rafRef = useRef<number | null>(null);

  const getCandleStartTime = useCallback((timestamp: number, res: CandleResolution): number => {
    const intervalMs = RESOLUTION_TO_MS[res];
    return Math.floor(timestamp / intervalMs) * intervalMs;
  }, []);

  const updateLiveCandle = useCallback(
    (trade: Trade) => {
      if (!mountedRef.current || currentMarketRef.current !== market) return;

      const price = parseFloat(trade.price);
      const size = parseFloat(trade.size);
      const tradeTime = new Date(trade.createdAt).getTime();
      const candleStartTime = getCandleStartTime(tradeTime, currentResolutionRef.current);

      setLivePrice(price);
      setLivePriceSide(trade.side);

      setCandles(prev => {
        if (!prev.length) return prev;

        const lastCandle = prev[0];
        const lastCandleTime = new Date(lastCandle.startedAt).getTime();

        // New candle started
        if (candleStartTime > lastCandleTime) {
          const newCandle: Candle = {
            startedAt: new Date(candleStartTime).toISOString(),
            ticker: market,
            resolution: currentResolutionRef.current,
            open: trade.price,
            high: trade.price,
            low: trade.price,
            close: trade.price,
            baseTokenVolume: trade.size,
            usdVolume: String(price * size),
            trades: 1,
            startingOpenInterest: lastCandle.startingOpenInterest,
            id: `${market}-${candleStartTime}`,
          };

          liveCandleRef.current = newCandle;
          setLatestCandle(newCandle);
          return [newCandle, ...prev].slice(0, limit);
        }

        // Update current candle
        if (candleStartTime === lastCandleTime) {
          const updatedCandle: Candle = {
            ...lastCandle,
            high: String(Math.max(parseFloat(lastCandle.high), price)),
            low: String(Math.min(parseFloat(lastCandle.low), price)),
            close: trade.price,
            baseTokenVolume: String(parseFloat(lastCandle.baseTokenVolume) + size),
            usdVolume: String(parseFloat(lastCandle.usdVolume) + price * size),
            trades: lastCandle.trades + 1,
          };

          liveCandleRef.current = updatedCandle;
          setLatestCandle(updatedCandle);

          const updated = [...prev];
          updated[0] = updatedCandle;
          return updated;
        }

        return prev;
      });
    },
    [market, getCandleStartTime, limit]
  );

  useEffect(() => {
    mountedRef.current = true;
    currentMarketRef.current = market;
    currentResolutionRef.current = resolution;

    setCandles([]);
    setLatestCandle(null);
    setLivePrice(null);
    setLivePriceSide(null);
    setIsLoading(true);
    setIsConnected(false);
    setError(null);
    liveCandleRef.current = null;

    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    // Cleanup previous subscriptions
    if (candleUnsubRef.current) {
      candleUnsubRef.current();
      candleUnsubRef.current = null;
    }
    if (tradeUnsubRef.current) {
      tradeUnsubRef.current();
      tradeUnsubRef.current = null;
    }

    const socketClient = getSocketClient();

    console.log('useRealtimeChart: Initializing for', market, resolution);

    // Fetch initial candles from indexer
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

        if (!mountedRef.current || currentMarketRef.current !== market) return;

        const fetchedCandles = data.candles || [];

        if (fetchedCandles.length > 0) {
          setCandles(fetchedCandles);
          setLatestCandle(fetchedCandles[0]);
          liveCandleRef.current = fetchedCandles[0];
          setLivePrice(parseFloat(fetchedCandles[0].close));
        }

        setIsLoading(false);
      } catch (err: any) {
        console.error('useRealtimeChart: Failed to fetch initial candles:', err);
        if (mountedRef.current && currentMarketRef.current === market) {
          setError(err.message || 'Failed to load candles');
          setIsLoading(false);
        }
      }
    };

    // Subscribe to candle updates (completed candles)
    const handleCandleMessage = (msg: WebSocketMessage) => {
      if (!mountedRef.current || currentMarketRef.current !== market) return;
      if (msg.type !== 'channel_data' || !msg.contents) return;

      const newCandle = msg.contents as Candle;

      setCandles(prev => {
        const existingIndex = prev.findIndex(c => c.startedAt === newCandle.startedAt);

        if (existingIndex !== -1) {
          const updated = [...prev];
          updated[existingIndex] = newCandle;
          liveCandleRef.current = newCandle;
          setLatestCandle(newCandle);
          setLivePrice(parseFloat(newCandle.close));
          return updated;
        } else {
          liveCandleRef.current = newCandle;
          setLatestCandle(newCandle);
          setLivePrice(parseFloat(newCandle.close));
          return [newCandle, ...prev].slice(0, limit);
        }
      });
    };

    // Subscribe to trades for live candle building
    const handleTradeMessage = (msg: WebSocketMessage) => {
      if (!mountedRef.current || currentMarketRef.current !== market) return;
      if (msg.type !== 'channel_data' || !msg.contents) return;

      const tradesArray = msg.contents?.trades;

      if (Array.isArray(tradesArray) && tradesArray.length > 0) {
        tradesArray.forEach((trade: Trade) => {
          if (rafRef.current) cancelAnimationFrame(rafRef.current);

          rafRef.current = requestAnimationFrame(() => {
            updateLiveCandle(trade);
            rafRef.current = null;
          });
        });
      }
    };

    // Subscribe to channels
    candleUnsubRef.current = socketClient.subscribeToCandles(
      market,
      resolution,
      handleCandleMessage,
      true
    );
    tradeUnsubRef.current = socketClient.subscribeToTrades(market, handleTradeMessage, true);

    // Update connection status
    setIsConnected(socketClient.isConnected());

    const removeOnConnect = socketClient.onConnect(() => {
      console.log('useRealtimeChart: WebSocket connected');
      if (mountedRef.current) {
        setIsConnected(true);
        setError(null);
      }
    });

    const removeOnDisconnect = socketClient.onDisconnect(() => {
      console.log('useRealtimeChart: WebSocket disconnected');
      if (mountedRef.current) {
        setIsConnected(false);
      }
    });

    // Initial load
    initCandles();

    return () => {
      console.log('useRealtimeChart: Cleaning up for', market);
      mountedRef.current = false;

      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }

      if (candleUnsubRef.current) {
        candleUnsubRef.current();
        candleUnsubRef.current = null;
      }

      if (tradeUnsubRef.current) {
        tradeUnsubRef.current();
        tradeUnsubRef.current = null;
      }

      removeOnConnect();
      removeOnDisconnect();
    };
  }, [market, resolution, limit, updateLiveCandle, getCandleStartTime]);

  return {
    candles,
    latestCandle,
    livePrice,
    livePriceSide,
    error,
    isLoading,
    isConnected,
  };
}
