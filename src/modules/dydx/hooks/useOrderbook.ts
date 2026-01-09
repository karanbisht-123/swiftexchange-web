import { useEffect, useRef, useState } from 'react';
import { getSocketClient } from '../client/clients';
import { useWebSocketStore } from '../store/websocketStore';
interface OrderbookLevel {
  price: string;
  size: string;
}

export interface OrderbookData {
  bids: OrderbookLevel[];
  asks: OrderbookLevel[];
  ts: number;
}


export function useOrderbook(market: string = 'BTC-USD') {
  const [orderbook, setOrderbook] = useState<OrderbookData | null>(null);
  const [dataSource, setDataSource] = useState<'api' | 'websocket' | null>(null);

  const bidsMap = useRef(new Map<number, number>());
  const asksMap = useRef(new Map<number, number>());
  const rafRef = useRef<number | undefined>(undefined);

  const isConnected = useWebSocketStore(state => state.isConnected);
  useEffect(() => {
    console.log(`[useOrderbook] Initializing ${market}`);
    bidsMap.current.clear();
    asksMap.current.clear();
    setOrderbook(null);
    setDataSource(null);
    if (rafRef.current !== undefined) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = undefined;
    }

    let active = true;
    let unsubscribe: (() => void) | null = null;
    const updateDisplay = () => {
      if (!active) return; 
      const sortedBids = Array.from(bidsMap.current.entries())
        .sort(([a], [b]) => b - a)
        .slice(0, 9);

      const sortedAsks = Array.from(asksMap.current.entries())
        .sort(([a], [b]) => a - b)
        .slice(0, 9);

      setOrderbook({
        bids: sortedBids.map(([price, size]) => ({
          price: price.toString(),
          size: size.toString(),
        })),
        asks: sortedAsks.map(([price, size]) => ({
          price: price.toString(),
          size: size.toString(),
        })),
        ts: Date.now(),
      });
    };


    const scheduleUpdate = () => {
      if (!active) return; // Don't schedule if effect has been cleaned up
      if (rafRef.current !== undefined) return; // Already scheduled

      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = undefined;
        updateDisplay();
      });
    };

    // WebSocket handler - created fresh for each market
    const handleUpdate = (data: any) => {
      if (!active) {
        // console.log(`[useOrderbook] Ignoring update, component unmounted or market changed`);
        return;
      }

      if (!data?.contents) return;

      let changed = false;

      // Process bids
      if (data.contents.bids?.length) {
        data.contents.bids.forEach((level: [string, string]) => {
          const price = Number(level[0]);
          const size = Number(level[1]);

          if (isNaN(price) || isNaN(size)) return;

          if (size === 0) {
            if (bidsMap.current.delete(price)) changed = true;
          } else {
            bidsMap.current.set(price, size);
            changed = true;
          }
        });
      }

      // Process asks
      if (data.contents.asks?.length) {
        data.contents.asks.forEach((level: [string, string]) => {
          const price = Number(level[0]);
          const size = Number(level[1]);

          if (isNaN(price) || isNaN(size)) return;

          if (size === 0) {
            if (asksMap.current.delete(price)) changed = true;
          } else {
            asksMap.current.set(price, size);
            changed = true;
          }
        });
      }

      if (changed) {
        setDataSource('websocket');
        scheduleUpdate();
      }
    };

    // Load snapshot
    const loadSnapshot = async () => {
      try {
        const { getIndexerClient } = await import('../client/clients');
        const snap = await getIndexerClient().markets.getPerpetualMarketOrderbook(market);

        if (!active) {
          console.log(`[useOrderbook] Snapshot aborted, market changed`);
          return;
        }

        // Load bids
        snap?.bids?.forEach((b: { price: string; size: string }) => {
          const price = Number(b.price);
          const size = Number(b.size);
          if (size > 0 && !isNaN(price) && !isNaN(size)) {
            bidsMap.current.set(price, size);
          }
        });

        // Load asks
        snap?.asks?.forEach((a: { price: string; size: string }) => {
          const price = Number(a.price);
          const size = Number(a.size);
          if (size > 0 && !isNaN(price) && !isNaN(size)) {
            asksMap.current.set(price, size);
          }
        });

        if (active) {
          updateDisplay();
          setDataSource('api');
          console.log(
            `[useOrderbook] Snapshot loaded: ${bidsMap.current.size} bids, ${asksMap.current.size} asks`
          );
        }
      } catch (err) {
        console.error('[useOrderbook] Snapshot error:', err);
      }
    };

    // Setup WebSocket subscription
    const setupWebSocket = () => {
      if (!isConnected) {
        console.log('[useOrderbook] WebSocket not connected');
        return;
      }

      try {
        const socketClient = getSocketClient();
        unsubscribe = socketClient.subscribeToOrderbook(market, handleUpdate);
        console.log(`[useOrderbook] Subscribed to ${market}`);
      } catch (err) {
        console.error('[useOrderbook] Subscribe error:', err);
      }
    };

    // Execute setup
    loadSnapshot();
    setupWebSocket();

    // Cleanup
    return () => {
      console.log(`[useOrderbook] Cleaning up ${market}`);
      active = false;

      if (unsubscribe) {
        unsubscribe();
        console.log(`[useOrderbook] Unsubscribed from ${market}`);
      }

      if (rafRef.current !== undefined) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = undefined;
      }
    };
  }, [market, isConnected]);

  return { orderbook, isConnected, dataSource };
}
