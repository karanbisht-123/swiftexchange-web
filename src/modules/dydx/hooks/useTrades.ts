import { useEffect, useRef, useState } from 'react';

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
  const unsubRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let isActive = true;
    mountedRef.current = true;
    currentMarketRef.current = market;

    setTrades([]);
    setIsLoading(true);
    setIsConnected(false);
    setError(null);

    if (unsubRef.current) {
      try {
        unsubRef.current();
      } catch (e) {
        console.error('[useTrades] Error during cleanup unsubscribe:', e);
      }
      unsubRef.current = null;
    }

    const cleanup = () => {
      isActive = false;
      if (unsubRef.current) {
        try {
          unsubRef.current();
        } catch (e) {
          console.error('[useTrades] Error during final cleanup:', e);
        }
        unsubRef.current = null;
      }
    };

    const loadSnapshot = async () => {
      try {
        const { getIndexerClient } = await import('../client/clients');
        const client = getIndexerClient();
        const response = await client.markets.getPerpetualMarketTrades(market, limit);

        if (!isActive || currentMarketRef.current !== market) return;

        const mappedTrades: Trade[] = (response?.trades || [])
          .filter((trade: any) => trade?.id)
          .map((trade: any) => ({
            id: trade.id,
            side: trade.side,
            size: trade.size,
            price: trade.price,
            createdAt: trade.createdAt,
          }));

        if (mountedRef.current) {
          console.log(`[useTrades] Loaded ${mappedTrades.length} initial trades from snapshot`);
          setTrades(mappedTrades);
          setIsLoading(false);
        }
      } catch (err: any) {
        console.error('[useTrades] Snapshot error:', err);
        if (isActive && mountedRef.current && currentMarketRef.current === market) {
          setError(err.message || 'Failed to load initial trades');
          setIsLoading(false);
        }
      }
    };

    const connectWebSocket = async () => {
      if (!isActive || currentMarketRef.current !== market) return;

      try {
        console.log('llllllllllllllll');
        const { getSocketClient } = await import('../client/clients');
        const socketClient = getSocketClient();

        if (!socketClient.isConnected?.()) {
          console.log('connecting ======================');
          await socketClient.connect();
        }

        if (!isActive || currentMarketRef.current !== market) {
          console.log('cleanup-----------');
          cleanup();
          return;
        }

        setIsConnected(true);

        unsubRef.current = socketClient.subscribeToTrades(market, (msg: any) => {
          console.log('tradesuscrbie');
          if (!mountedRef.current || currentMarketRef.current !== market) return;
          let tradesArray: any[] = [];

          if (Array.isArray(msg.contents)) {
            tradesArray = msg.contents.flatMap((content: any) => content.trades || []);
          } else if (msg.contents?.trades) {
            tradesArray = msg.contents.trades;
          } else if (msg.trades) {
            tradesArray = msg.trades;
          }

          console.log('Received trades via websocket:', tradesArray); // This will now work

          if (!Array.isArray(tradesArray) || tradesArray.length === 0) return;

          const newTrades: Trade[] = tradesArray
            .filter((trade: any) => trade?.id)
            .map((trade: any) => ({
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

            if (uniqueNewTrades.length === 0) {
              return prevTrades;
            }

            console.log(`[useTrades] Adding ${uniqueNewTrades.length} new trades from WS`);
            const updated = [...uniqueNewTrades, ...prevTrades];

            // Sort by createdAt descending just in case batch is out of order
            updated.sort(
              (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
            );

            return updated.slice(0, limit);
          });
        });

        console.log('[useTrades] Successfully subscribed to live trades');
      } catch (err: any) {
        console.error('[useTrades] WebSocket connection/subscription error:', err);
        if (isActive && mountedRef.current) {
          setIsConnected(false);
        }
      }
    };

    loadSnapshot();
    connectWebSocket();

    return cleanup;
  }, [market, limit]);

  // Handle unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  return {
    trades,
    isLoading,
    isConnected,
    error,
  };
}
