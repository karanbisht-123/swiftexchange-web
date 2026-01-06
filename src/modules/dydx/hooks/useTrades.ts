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

  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [livePriceSide, setLivePriceSide] = useState<'BUY' | 'SELL' | null>(null);

  const mountedRef = useRef(true);
  const currentMarketRef = useRef(market);
  const unsubRef = useRef<(() => void) | null>(null);
  const prevMarketRef = useRef(market);

  useEffect(() => {
    let isActive = true;
    mountedRef.current = true;
    currentMarketRef.current = market;

    if (trades.length === 0) {
      setIsLoading(true);
    }

    setIsConnected(false);
    setError(null);

    // Cleanup previous subscription if exists
    if (unsubRef.current) {
      try {
        unsubRef.current();
      } catch (e) {
        // console.error('[useTrades] Error during cleanup unsubscribe:', e);
      }
      unsubRef.current = null;
    }

    const cleanup = () => {
      isActive = false;
      if (unsubRef.current) {
        try {
          unsubRef.current();
        } catch (e) {
          // console.error('[useTrades] Error during final cleanup:', e);
        }
        unsubRef.current = null;
      }
    };

    const loadSnapshot = async () => {
      try {
        const { getIndexerClient } = await import('../client/clients');
        const client = getIndexerClient();
        let response;

        // Primary attempt with full parameters
        try {
          response = await client.markets.getPerpetualMarketTrades(
            market,
            undefined,
            undefined,
            limit
          );
        } catch (e) {
          // Fallback: retry with minimal parameters if the detailed call fails
          // console.log('[useTrades] Retrying with just market parameter');
          response = await client.markets.getPerpetualMarketTrades(market);
        }

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

        if (mountedRef.current && currentMarketRef.current === market) {
          // console.log(`[useTrades] Loaded ${mappedTrades.length} trades for ${market}`);
          setTrades(mappedTrades);

          // Set initial live price from the most recent trade
          if (mappedTrades.length > 0) {
            const latestTrade = mappedTrades[0];
            setLivePrice(parseFloat(latestTrade.price));
            setLivePriceSide(latestTrade.side);
          }

          setIsLoading(false);
          prevMarketRef.current = market;
        }
      } catch (err: any) {
        // console.error('[useTrades] Snapshot error:', err);
        if (isActive && mountedRef.current && currentMarketRef.current === market) {
          setError(err.message || 'Failed to load initial trades');
          setIsLoading(false);
        }
      }
    };

    const connectWebSocket = async () => {
      if (!isActive || currentMarketRef.current !== market) return;

      try {
        const { getSocketClient } = await import('../client/clients');
        const socketClient = getSocketClient();

        // Ensure WebSocket is connected
        if (!socketClient.isConnected?.()) {
          // console.log('[useTrades] Establishing WebSocket connection');
          await socketClient.connect();
        }

        if (!isActive || currentMarketRef.current !== market) {
          cleanup();
          return;
        }

        setIsConnected(true);

        // Subscribe to live trade updates
        unsubRef.current = socketClient.subscribeToTrades(market, (msg: any) => {
          if (!mountedRef.current || currentMarketRef.current !== market) return;

          let tradesArray: any[] = [];

          if (Array.isArray(msg.contents)) {
            tradesArray = msg.contents.flatMap((content: any) => content.trades || []);
          } else if (msg.contents?.trades) {
            tradesArray = msg.contents.trades;
          } else if (msg.trades) {
            tradesArray = msg.trades;
          }

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

          // Update live price with the latest incoming trade
          if (newTrades.length > 0) {
            const latestTrade = newTrades[newTrades.length - 1];
            setLivePrice(parseFloat(latestTrade.price));
            setLivePriceSide(latestTrade.side);
          }

          // Merge new trades, avoid duplicates, keep sorted and limited
          setTrades(prevTrades => {
            if (!mountedRef.current || currentMarketRef.current !== market) return prevTrades;

            const existingIds = new Set(prevTrades.map(t => t.id));
            const uniqueNewTrades = newTrades.filter(t => !existingIds.has(t.id));

            if (uniqueNewTrades.length === 0) return prevTrades;

            const updated = [...uniqueNewTrades, ...prevTrades];

            updated.sort(
              (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
            );

            return updated.slice(0, limit);
          });
        });
      } catch (err: any) {
        // console.error('[useTrades] WebSocket connection/subscription error:', err);
        if (isActive && mountedRef.current) {
          setError('Failed to connect to live trades');
          setIsConnected(false);
        }
      }
    };

    loadSnapshot();
    connectWebSocket();

    return cleanup;
  }, [market, limit]);

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
    livePrice,
    livePriceSide,
  };
}
