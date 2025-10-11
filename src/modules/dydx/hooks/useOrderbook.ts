import { useEffect, useRef, useState } from 'react';

import type { WebSocketMessage } from '../utils/WebSocketManager';

interface OrderbookEntry {
  price: string;
  size: string;
}

interface OrderbookData {
  bids: OrderbookEntry[];
  asks: OrderbookEntry[];
}

interface UseOrderbookReturn {
  orderbook: OrderbookData | null;
  error: string | null;
  isLoading: boolean;
  isConnected: boolean;
  debugInfo: any;
}

export function useOrderbook(market: string = 'BTC-USD'): UseOrderbookReturn {
  const [orderbook, setOrderbook] = useState<OrderbookData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  console.log(setIsLoading);
  const [isConnected, setIsConnected] = useState(false);

  const unsubscribeRef = useRef<(() => void) | null>(null);
  const isMountedRef = useRef(true);
  const hasInitialDataRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;
    hasInitialDataRef.current = false;
    let socketClient: any = null;
    // let indexerClient: any = null;

    // const fetchInitialOrderbook = async () => {
    //   try {
    //     const { getIndexerClient } = await import("../client/clients");
    //     indexerClient = getIndexerClient();

    //     console.log(`[useOrderbook] Fetching initial orderbook for ${market}`);

    //     setIsLoading(true);
    //     setError(null);

    //     const data = await indexerClient.markets.getPerpetualMarketOrderbook(
    //       market
    //     );

    //     if (!isMountedRef.current) return null;

    //     const orderbookData = {
    //       bids: data.bids || [],
    //       asks: data.asks || [],
    //     };

    //     setOrderbook(orderbookData);
    //     setIsLoading(false);
    //     hasInitialDataRef.current = true;
    //     console.log(`[useOrderbook] Initial orderbook loaded for ${market}:`, {
    //       bids: orderbookData.bids.length,
    //       asks: orderbookData.asks.length,
    //     });

    //     return orderbookData;
    //   } catch (err: any) {
    //     console.error("[useOrderbook] Error fetching initial data:", err);
    //     if (isMountedRef.current) {
    //       setError(err.message || "Failed to load orderbook");
    //       setIsLoading(false);
    //     }
    //     return null;
    //   }
    // };

    const initializeWebSocket = async () => {
      try {
        const { getSocketClient } = await import('../client/clients');
        socketClient = getSocketClient();

        console.log(`[useOrderbook] Connecting to WebSocket for ${market}`);

        await socketClient.connect();

        if (!isMountedRef.current) return;

        setIsConnected(true);
        setError(null); // Clear any previous errors
        console.log('[useOrderbook] WebSocket connected successfully');

        // Subscribe to orderbook updates
        const handleMessage = (msg: WebSocketMessage) => {
          if (!isMountedRef.current) return;

          console.log('[useOrderbook] WS message:', {
            type: msg.type,
            channel: msg.channel,
            id: msg.id,
          });

          if (msg.type !== 'channel_data' || !msg.contents) {
            return;
          }

          setOrderbook(prev => {
            if (!prev) {
              return {
                bids: msg.contents?.bids || [],
                asks: msg.contents?.asks || [],
              };
            }

            const updatedBids = [...prev.bids];
            const updatedAsks = [...prev.asks];

            // Apply bid deltas
            if (Array.isArray(msg.contents?.bids)) {
              msg.contents.bids.forEach((bid: [string, string]) => {
                const [price, size] = bid;
                const index = updatedBids.findIndex(b => b.price === price);

                if (parseFloat(size) === 0) {
                  if (index !== -1) {
                    updatedBids.splice(index, 1);
                  }
                } else {
                  if (index !== -1) {
                    updatedBids[index] = { price, size };
                  } else {
                    updatedBids.push({ price, size });
                  }
                }
              });

              updatedBids.sort((a, b) => parseFloat(b.price) - parseFloat(a.price));
            }

            // Apply ask deltas
            if (Array.isArray(msg.contents?.asks)) {
              msg.contents.asks.forEach((ask: [string, string]) => {
                const [price, size] = ask;
                const index = updatedAsks.findIndex(a => a.price === price);

                if (parseFloat(size) === 0) {
                  if (index !== -1) {
                    updatedAsks.splice(index, 1);
                  }
                } else {
                  if (index !== -1) {
                    updatedAsks[index] = { price, size };
                  } else {
                    updatedAsks.push({ price, size });
                  }
                }
              });

              updatedAsks.sort((a, b) => parseFloat(a.price) - parseFloat(b.price));
            }

            return { bids: updatedBids, asks: updatedAsks };
          });
        };

        unsubscribeRef.current = socketClient.subscribeToOrderbook(market, handleMessage);
        console.log(`[useOrderbook] Subscribed to orderbook for ${market}`);

        // Monitor connection status
        const onConnectCleanup = socketClient.onConnect(() => {
          if (isMountedRef.current) {
            console.log('[useOrderbook] WebSocket reconnected');
            setIsConnected(true);
            setError(null);
          }
        });

        const onDisconnectCleanup = socketClient.onDisconnect(() => {
          if (isMountedRef.current) {
            console.log('[useOrderbook] WebSocket disconnected');
            setIsConnected(false);
            // Don't set error on disconnect - we still have data
          }
        });

        // Store cleanup functions
        return () => {
          onConnectCleanup();
          onDisconnectCleanup();
        };
      } catch (err: any) {
        console.error('[useOrderbook] WebSocket error:', err);
        if (isMountedRef.current) {
          setIsConnected(false);
          // Only set error if we don't have initial data
          if (!hasInitialDataRef.current) {
            setError(err.message || 'Failed to connect to WebSocket');
          } else {
            console.log('[useOrderbook] WebSocket failed but initial data is available');
          }
        }
      }
    };

    const initialize = async () => {
      // Step 1: Fetch initial orderbook data from API
      // const initialOrderbook = await fetchInitialOrderbook();

      // Step 2: Try to connect WebSocket (non-blocking)
      // Even if WebSocket fails, we have the initial data
      if (isMountedRef.current) {
        const wsCleanup = await initializeWebSocket();
        return wsCleanup;
      }
    };

    // Start initialization
    const cleanupPromise = initialize();

    // Cleanup function
    return () => {
      isMountedRef.current = false;
      console.log(`[useOrderbook] Cleaning up for ${market}`);

      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }

      // Execute any additional cleanup
      cleanupPromise.then(cleanup => {
        if (cleanup) cleanup();
      });
    };
  }, [market]); // Only depend on market

  // Return all state
  return {
    orderbook,
    error,
    isLoading,
    isConnected,
    debugInfo: {}, // Simplified to avoid accessing socket before init
  };
}
