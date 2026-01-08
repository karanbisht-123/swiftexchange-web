import { useEffect, useMemo, useRef, useState } from 'react';

import { useWebSocketStore } from '../store/websocketStore';

interface Trade {
  id: string;
  side: 'BUY' | 'SELL';
  size: string;
  price: string;
  createdAt: string;
}

export function useTrades(market: string = 'BTC-USD', limit: number = 50) {
  const [snapshotTrades, setSnapshotTrades] = useState<Trade[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const mountedRef = useRef(true);
  const currentMarketRef = useRef(market);

  const subscribeToTrades = useWebSocketStore(state => state.subscribeToTrades);
  const unsubscribeFromTrades = useWebSocketStore(state => state.unsubscribeFromTrades);
  const isConnected = useWebSocketStore(state => state.isConnected);
  const tradesData = useWebSocketStore(state => state.trades.get(market));

  useEffect(() => {
    let isActive = true;
    mountedRef.current = true;
    currentMarketRef.current = market;

    setIsLoading(true);
    setError(null);

    const loadSnapshot = async () => {
      try {
        const { getIndexerClient } = await import('../client/clients');
        const client = getIndexerClient();
        let response;

        try {
          response = await client.markets.getPerpetualMarketTrades(
            market,
            undefined,
            undefined,
            limit
          );
        } catch {
          // Fallback: retry with minimal parameters
          response = await client.markets.getPerpetualMarketTrades(market);
        }

        if (!isActive || currentMarketRef.current !== market) return;

        const mappedTrades: Trade[] = (response?.trades || [])
          .filter((trade: { id?: string }) => trade?.id)
          .map(
            (trade: {
              id: string;
              side: 'BUY' | 'SELL';
              size: string;
              price: string;
              createdAt: string;
            }) => ({
              id: trade.id,
              side: trade.side,
              size: trade.size,
              price: trade.price,
              createdAt: trade.createdAt,
            })
          );

        if (mountedRef.current && currentMarketRef.current === market) {
          setSnapshotTrades(mappedTrades);
          setIsLoading(false);
        }
      } catch (err: unknown) {
        if (isActive && mountedRef.current && currentMarketRef.current === market) {
          setError(err instanceof Error ? err.message : 'Failed to load initial trades');
          setIsLoading(false);
        }
      }
    };

    loadSnapshot();

    return () => {
      isActive = false;
    };
  }, [market, limit]);

  // Subscribe to WebSocket updates via store
  useEffect(() => {
    currentMarketRef.current = market;

    // Subscribe to trades for this market
    subscribeToTrades(market);

    return () => {
      unsubscribeFromTrades(market);
    };
  }, [market, subscribeToTrades, unsubscribeFromTrades]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const trades = useMemo(() => {
    const liveTrades = tradesData?.trades || [];

    if (liveTrades.length === 0) {
      return snapshotTrades;
    }

    const existingIds = new Set(snapshotTrades.map(t => t.id));
    const uniqueLiveTrades = liveTrades
      .filter((t: { id?: string }) => t?.id && !existingIds.has(t.id))
      .map((t: { id: string; side: string; size: string; price: string; createdAt: string }) => ({
        id: t.id,
        side: t.side as 'BUY' | 'SELL',
        size: t.size,
        price: t.price,
        createdAt: t.createdAt,
      }));

    const merged = [...uniqueLiveTrades, ...snapshotTrades];
    merged.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return merged.slice(0, limit);
  }, [snapshotTrades, tradesData, limit]);

  const livePrice = useMemo(() => {
    if (trades.length > 0) {
      return parseFloat(trades[0].price);
    }
    return null;
  }, [trades]);

  const livePriceSide = useMemo(() => {
    if (trades.length > 0) {
      return trades[0].side;
    }
    return null;
  }, [trades]);

  return {
    trades,
    isLoading,
    isConnected,
    error,
    livePrice,
    livePriceSide,
  };
}
