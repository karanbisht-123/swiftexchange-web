import { useEffect, useRef, useState } from 'react';

import type { WebSocketMessage } from '../utils/WebSocketManager';

export interface Trade {
  id: string;
  side: 'BUY' | 'SELL';
  size: string;
  price: string;
  type: string;
  createdAt: string;
  createdAtHeight: string;
}

interface UseTradesReturn {
  trades: Trade[];
  latestTrade: Trade | null;
  error: string | null;
  isLoading: boolean;
  isConnected: boolean;
  stats: {
    totalVolume: number;
    buyVolume: number;
    sellVolume: number;
    tradeCount: number;
  };
}

export function useTrades(market: string = 'BTC-USD', maxTrades: number = 50): UseTradesReturn {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [latestTrade, setLatestTrade] = useState<Trade | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isConnected, setIsConnected] = useState(false);

  const unsubscribeRef = useRef<(() => void) | null>(null);
  const isMountedRef = useRef(true);

  const stats = {
    totalVolume: trades.reduce((sum, t) => sum + parseFloat(t.price) * parseFloat(t.size), 0),
    buyVolume: trades
      .filter(t => t.side === 'BUY')
      .reduce((sum, t) => sum + parseFloat(t.price) * parseFloat(t.size), 0),
    sellVolume: trades
      .filter(t => t.side === 'SELL')
      .reduce((sum, t) => sum + parseFloat(t.price) * parseFloat(t.size), 0),
    tradeCount: trades.length,
  };

  useEffect(() => {
    isMountedRef.current = true;
    let socketClient: any = null;
    let indexerClient: any = null;

    const initializeConnection = async () => {
      try {
        const { getSocketClient, getIndexerClient } = await import('../client/clients');

        socketClient = getSocketClient();
        indexerClient = getIndexerClient();

        console.log(`[useTrades] Initializing for ${market}`);

        await socketClient.connect();
        if (!isMountedRef.current) return;
        setIsConnected(true);

        // Fetch initial trades from REST API
        setIsLoading(true);
        setError(null);

        const data = await indexerClient.markets.getPerpetualMarketTrades(market, maxTrades);

        if (!isMountedRef.current) return;

        const initialTrades = data.trades || [];
        setTrades(initialTrades);
        if (initialTrades.length > 0) {
          setLatestTrade(initialTrades[0]);
        }
        setIsLoading(false);
        console.log(`[useTrades] Loaded ${initialTrades.length} initial trades`);

        // Subscribe to real-time trade updates
        const handleMessage = (msg: WebSocketMessage) => {
          if (!isMountedRef.current) return;

          console.log('[useTrades] WS message:', {
            type: msg.type,
            channel: msg.channel,
            id: msg.id,
            hasContents: !!msg.contents,
          });

          if (msg.type !== 'channel_data' || !msg.contents) {
            return;
          }

          // dYdX sends trades in a 'trades' array in contents
          const newTrades = msg.contents.trades || [];

          if (newTrades.length > 0) {
            setTrades(prev => {
              // Add new trades and keep only maxTrades
              const updated = [...newTrades, ...prev];
              return updated.slice(0, maxTrades);
            });

            setLatestTrade(newTrades[0]);
          }
        };

        unsubscribeRef.current = socketClient.subscribeToTrades(market, handleMessage);
        console.log(`[useTrades] Subscribed to trades for ${market}`);

        const onConnectCleanup = socketClient.onConnect(() => {
          if (isMountedRef.current) {
            console.log('[useTrades] Connection established');
            setIsConnected(true);
            setError(null);
          }
        });

        const onDisconnectCleanup = socketClient.onDisconnect(() => {
          if (isMountedRef.current) {
            console.log('[useTrades] Connection lost');
            setIsConnected(false);
          }
        });

        return () => {
          onConnectCleanup();
          onDisconnectCleanup();
        };
      } catch (err: any) {
        console.error('[useTrades] Error:', err);
        if (isMountedRef.current) {
          setError(err.message || 'Failed to load trades');
          setIsConnected(false);
          setIsLoading(false);
        }
      }
    };

    const cleanupPromise = initializeConnection();

    return () => {
      isMountedRef.current = false;
      console.log(`[useTrades] Cleaning up ${market}`);

      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }

      cleanupPromise.then(cleanup => {
        if (cleanup) cleanup();
      });
    };
  }, [market, maxTrades]);

  return {
    trades,
    latestTrade,
    error,
    isLoading,
    isConnected,
    stats,
  };
}
