import {useEffect, useRef, useState } from 'react';

interface Trade {
  id: string;
  side: 'BUY' | 'SELL';
  size: string;
  price: string;
  createdAt: string;
}

export function useTrades(market: string = 'BTC-USD', limit: number = 50) {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mountedRef = useRef(true);
  const currentMarketRef = useRef(market);
  const socketRef = useRef<any>(null);
  const unsubRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let isActive = true;
    let initComplete = false;

    mountedRef.current = true;
    currentMarketRef.current = market;

    setTrades([]);
    setIsLoading(true);
    setIsConnected(false);
    setError(null);

    const cleanup = () => {
      isActive = false;

      if (unsubRef.current) {
        try {
          unsubRef.current();
        } catch (err) {
          console.error('Trades unsubscribe error:', err);
        }
        unsubRef.current = null;
      }

      if (socketRef.current) {
        try {
          socketRef.current.disconnect();
        } catch (err) {
          console.error('Trades socket disconnect error:', err);
        }
        socketRef.current = null;
      }
    };

    const initSnapshot = async () => {
      if (!isActive || currentMarketRef.current !== market) return;

      try {
        const { getIndexerClient } = await import('../client/clients');
        const client = getIndexerClient();
        const response = await client.markets.getPerpetualMarketTrades(market, limit);

        if (!isActive || currentMarketRef.current !== market) return;

        if (response?.trades && Array.isArray(response.trades)) {
          const mappedTrades: Trade[] = response.trades.map((trade: any) => ({
            id: trade.id,
            side: trade.side,
            size: trade.size,
            price: trade.price,
            createdAt: trade.createdAt,
          }));

          if (isActive && mountedRef.current && currentMarketRef.current === market) {
            setTrades(mappedTrades);
            setIsLoading(false);
            initComplete = true;
          }
        } else {
          if (isActive && mountedRef.current && currentMarketRef.current === market) {
            setTrades([]);
            setIsLoading(false);
            initComplete = true;
          }
        }
      } catch (err: any) {
        console.error('Trades snapshot error:', err);
        if (isActive && mountedRef.current && currentMarketRef.current === market) {
          setError(err.message || 'Failed to load trades');
          setIsLoading(false);
        }
      }
    };

    const connectWebSocket = async () => {
      console.log(`[useTrades] Connecting to trades websocket for ${market}`);
      if (!isActive || !initComplete || currentMarketRef.current !== market) return;

      try {
        // console.log('[useTrades] Getting socket client');
        const { getSocketClient } = await import('../client/clients');
        socketRef.current = getSocketClient();
        await socketRef.current.connect();

        if (!isActive || currentMarketRef.current !== market) {
          cleanup();
          return;
        }

        setIsConnected(true);

        unsubRef.current = socketRef.current.subscribeToTrades(market, (msg: any) => {
          // console.log('[useTrades] Received websocket message:', msg);
          if (!isActive || !mountedRef.current || currentMarketRef.current !== market) return;
          if (msg.type !== 'channel_data' || !msg.contents) return;

          const tradesArray = msg.contents?.trades;

          // console.log('Received trades via websocket:', tradesArray);

          if (Array.isArray(tradesArray) && tradesArray.length > 0) {
            const newTrades: Trade[] = tradesArray.map((trade: any) => ({
              id: trade.id,
              side: trade.side,
              size: trade.size,
              price: trade.price,
              createdAt: trade.createdAt,
            }));

            setTrades(prevTrades => {
              if (!mountedRef.current || currentMarketRef.current !== market) return prevTrades;
              const existingIds = new Set(prevTrades.map(t => t.id));
              const uniqueNewTrades = newTrades.filter(t => !existingIds.has(t.id));

              if (uniqueNewTrades.length === 0) return prevTrades;

              const updated = [...uniqueNewTrades, ...prevTrades];
              return updated.slice(0, limit);
            });
          }
        });
      } catch (err: any) {
        console.error('Trades websocket error:', err);
        if (isActive && mountedRef.current && currentMarketRef.current === market) {
          setIsConnected(false);
        }
      }
    };

    initSnapshot().then(() => {
      if (isActive && initComplete) {
        connectWebSocket();
      }
    });

    return cleanup;
  }, [market, limit]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  return { trades, isLoading, isConnected, error };
}
