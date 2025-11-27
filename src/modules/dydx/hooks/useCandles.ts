import { useCallback, useEffect, useRef, useState } from 'react';

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
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isConnected, setIsConnected] = useState(false);

  const mountedRef = useRef(true);
  const currentMarketRef = useRef(market);
  const currentResolutionRef = useRef(resolution);
  const candleUnsubRef = useRef<(() => void) | null>(null);
  const tradeUnsubRef = useRef<(() => void) | null>(null);
  const socketRef = useRef<any>(null);
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

      setCandles(prev => {
        if (!prev.length) return prev;

        const lastCandle = prev[0];
        const lastCandleTime = new Date(lastCandle.startedAt).getTime();

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
    let isActive = true;
    let candleInitComplete = false;

    mountedRef.current = true;
    currentMarketRef.current = market;
    currentResolutionRef.current = resolution;

    setCandles([]);
    setLatestCandle(null);
    setLivePrice(null);
    setIsLoading(true);
    setIsConnected(false);
    setError(null);
    liveCandleRef.current = null;

    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    const cleanup = () => {
      isActive = false;

      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }

      if (candleUnsubRef.current) {
        try {
          candleUnsubRef.current();
        } catch (err) {
          console.error('Candle unsubscribe error:', err);
        }
        candleUnsubRef.current = null;
      }

      if (tradeUnsubRef.current) {
        try {
          tradeUnsubRef.current();
        } catch (err) {
          console.error('Trade unsubscribe error:', err);
        }
        tradeUnsubRef.current = null;
      }

      if (socketRef.current) {
        try {
          socketRef.current.disconnect();
        } catch (err) {
          console.error('Socket disconnect error:', err);
        }
        socketRef.current = null;
      }
    };

    const initCandles = async () => {
      if (!isActive || currentMarketRef.current !== market) return;

      try {
        const { getIndexerClient } = await import('../client/clients');
        const client = getIndexerClient();
        const data = await client.markets.getPerpetualMarketCandles(
          market,
          resolution,
          undefined,
          undefined,
          limit
        );

        if (!isActive || currentMarketRef.current !== market) return;

        const fetchedCandles = data.candles || [];

        if (fetchedCandles.length > 0) {
          setCandles(fetchedCandles);
          setLatestCandle(fetchedCandles[0]);
          liveCandleRef.current = fetchedCandles[0];
          setLivePrice(parseFloat(fetchedCandles[0].close));
        }

        setIsLoading(false);
        setError(null);
        candleInitComplete = true;
      } catch (err: any) {
        console.error('Candles snapshot error:', err);
        if (isActive && mountedRef.current && currentMarketRef.current === market) {
          setError(err.message || 'Failed to load candles');
          setIsLoading(false);
        }
      }
    };

    const connectWebSocket = async () => {
      if (!isActive || !candleInitComplete || currentMarketRef.current !== market) return;

      try {
        const { getSocketClient } = await import('../client/clients');
        socketRef.current = getSocketClient();
        await socketRef.current.connect();

        if (!isActive || currentMarketRef.current !== market) {
          cleanup();
          return;
        }

        setIsConnected(true);

        candleUnsubRef.current = socketRef.current.subscribeToCandles(
          market,
          resolution,
          (msg: any) => {
            if (!isActive || !mountedRef.current || currentMarketRef.current !== market) return;
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
          }
        );

        tradeUnsubRef.current = socketRef.current.subscribeToTrades(market, (msg: any) => {
          if (!isActive || !mountedRef.current || currentMarketRef.current !== market) return;
          if (msg.type !== 'channel_data' || !msg.contents) return;

          const tradesArray = msg.contents?.trades;

          if (Array.isArray(tradesArray) && tradesArray.length > 0) {
            tradesArray.forEach((trade: any) => {
              if (rafRef.current) {
                cancelAnimationFrame(rafRef.current);
              }

              rafRef.current = requestAnimationFrame(() => {
                updateLiveCandle(trade);
                rafRef.current = null;
              });
            });
          }
        });
      } catch (err: any) {
        console.error('WebSocket connection error:', err);
        if (isActive && mountedRef.current && currentMarketRef.current === market) {
          setIsConnected(false);
        }
      }
    };

    initCandles().then(() => {
      if (isActive && candleInitComplete) {
        connectWebSocket();
      }
    });

    return cleanup;
  }, [market, resolution, limit, updateLiveCandle, getCandleStartTime]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  return {
    candles,
    latestCandle,
    livePrice,
    error,
    isLoading,
    isConnected,
  };
}
