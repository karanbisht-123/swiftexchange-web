import { useCallback, useEffect, useRef, useState } from 'react';

interface OrderbookLevel {
  price: string;
  size: string;
}

interface OrderbookData {
  bids: OrderbookLevel[];
  asks: OrderbookLevel[];
  ts: number;
  messageId?: number;
}

interface OrderbookState {
  bidsMap: Map<string, number>;
  asksMap: Map<string, number>;
  bidsSorted: string[];
  asksSorted: string[];
}

export function useOrderbook(market: string = 'BTC-USD') {
  const [orderbook, setOrderbook] = useState<OrderbookData | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [dataSource, setDataSource] = useState<'api' | 'websocket' | null>(null);

  const stateRef = useRef<OrderbookState>({
    bidsMap: new Map(),
    asksMap: new Map(),
    bidsSorted: [],
    asksSorted: [],
  });

  const lastMessageId = useRef(0);
  const rafId = useRef<number | null>(null);
  const pendingUpdate = useRef(false);
  const mountedRef = useRef(true);
  const currentMarketRef = useRef(market);
  const socketRef = useRef<any>(null);
  const unsubRef = useRef<(() => void) | null>(null);

  const cleanupState = useCallback(() => {
    stateRef.current.bidsMap.clear();
    stateRef.current.asksMap.clear();
    stateRef.current.bidsSorted = [];
    stateRef.current.asksSorted = [];
    lastMessageId.current = 0;
    pendingUpdate.current = false;
  }, []);

  const insertSorted = useCallback((arr: string[], priceStr: string, isBid: boolean): string[] => {
    const price = parseFloat(priceStr);
    let low = 0;
    let high = arr.length;

    if (isBid) {
      while (low < high) {
        const mid = (low + high) >>> 1;
        if (parseFloat(arr[mid]) > price) low = mid + 1;
        else high = mid;
      }
    } else {
      while (low < high) {
        const mid = (low + high) >>> 1;
        if (parseFloat(arr[mid]) < price) low = mid + 1;
        else high = mid;
      }
    }

    const newArr = [...arr];
    newArr.splice(low, 0, priceStr);
    return newArr;
  }, []);

  const forceUpdate = useCallback(() => {
    if (!mountedRef.current) return;

    const ts = Date.now();
    const state = stateRef.current;

    const newBids: OrderbookLevel[] = state.bidsSorted.slice(0, 100).map(price => ({
      price,
      size: String(state.bidsMap.get(price) || 0),
    }));

    const newAsks: OrderbookLevel[] = state.asksSorted.slice(0, 100).map(price => ({
      price,
      size: String(state.asksMap.get(price) || 0),
    }));

    setOrderbook(prevOrderbook => {
      if (!mountedRef.current) return prevOrderbook;

      const areLevelsEqual = (a: OrderbookLevel[], b: OrderbookLevel[]): boolean => {
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) {
          if (a[i].price !== b[i].price || a[i].size !== b[i].size) {
            return false;
          }
        }
        return true;
      };

      if (
        prevOrderbook &&
        areLevelsEqual(prevOrderbook.bids, newBids) &&
        areLevelsEqual(prevOrderbook.asks, newAsks)
      ) {
        return prevOrderbook;
      }

      return {
        bids: newBids,
        asks: newAsks,
        ts,
        messageId: lastMessageId.current,
      };
    });
  }, []); // Empty deps - function is stable

  // Remove market from dependencies - use ref instead
  const scheduleUpdate = useCallback(() => {
    if (pendingUpdate.current || !mountedRef.current) return;

    pendingUpdate.current = true;

    if (rafId.current !== null) {
      cancelAnimationFrame(rafId.current);
    }

    rafId.current = requestAnimationFrame(() => {
      if (!mountedRef.current) {
        pendingUpdate.current = false;
        return;
      }
      pendingUpdate.current = false;
      forceUpdate();
    });
  }, [forceUpdate]); // Only depends on forceUpdate which is now stable

  const processUpdate = useCallback(
    (levels: [string, string][], isBid: boolean) => {
      if (!mountedRef.current) return false;

      const state = stateRef.current;
      const map = isBid ? state.bidsMap : state.asksMap;
      const sorted = isBid ? state.bidsSorted : state.asksSorted;
      let changed = false;

      levels.forEach(([priceStr, sizeStr]) => {
        const size = parseFloat(sizeStr);
        const prevSize = map.get(priceStr);

        if (size <= 0) {
          if (prevSize !== undefined) {
            map.delete(priceStr);
            const newSorted = sorted.filter(p => p !== priceStr);
            if (isBid) state.bidsSorted = newSorted;
            else state.asksSorted = newSorted;
            changed = true;
          }
        } else if (prevSize !== size) {
          map.set(priceStr, size);

          if (prevSize === undefined) {
            const newSorted = insertSorted(sorted, priceStr, isBid);
            if (isBid) state.bidsSorted = newSorted;
            else state.asksSorted = newSorted;
          }
          changed = true;
        }
      });

      return changed;
    },
    [insertSorted]
  );

  useEffect(() => {
    let isActive = true;
    let initComplete = false;

    mountedRef.current = true;
    currentMarketRef.current = market;

    cleanupState();
    setOrderbook(null);
    setIsConnected(false);
    setDataSource(null);

    if (rafId.current !== null) {
      cancelAnimationFrame(rafId.current);
      rafId.current = null;
    }

    const cleanup = () => {
      isActive = false;

      if (rafId.current !== null) {
        cancelAnimationFrame(rafId.current);
        rafId.current = null;
      }

      if (unsubRef.current) {
        try {
          unsubRef.current();
        } catch (err) {
          console.error('Unsubscribe error:', err);
        }
        unsubRef.current = null;
      }

      if (socketRef.current) {
        try {
          socketRef.current.disconnect();
        } catch (err) {
          console.error('Socket disconnect error:', err);
        }
        socketRef.current = null;
      }

      cleanupState();
    };

    const initSnapshot = async () => {
      if (!isActive || currentMarketRef.current !== market) return;

      try {
        const { getIndexerClient } = await import('../client/clients');
        const client = getIndexerClient();
        const snap = await client.markets.getPerpetualMarketOrderbook(market);

        if (!isActive || currentMarketRef.current !== market) return;

        const state = stateRef.current;

        if (snap?.bids) {
          snap.bids.forEach((b: any) => {
            const priceStr = String(b.price);
            const size = parseFloat(b.size);

            if (size > 0) {
              state.bidsMap.set(priceStr, size);
              state.bidsSorted.push(priceStr);
            }
          });

          state.bidsSorted.sort((a, b) => parseFloat(b) - parseFloat(a));
        }

        if (snap?.asks) {
          snap.asks.forEach((a: any) => {
            const priceStr = String(a.price);
            const size = parseFloat(a.size);

            if (size > 0) {
              state.asksMap.set(priceStr, size);
              state.asksSorted.push(priceStr);
            }
          });

          state.asksSorted.sort((a, b) => parseFloat(a) - parseFloat(b));
        }

        if (isActive && mountedRef.current && currentMarketRef.current === market) {
          forceUpdate();
          setDataSource('api');
          initComplete = true;
        }
      } catch (err) {
        console.error('Orderbook snapshot error:', err);
      }
    };

    const connectWebSocket = async () => {
      if (!isActive || !initComplete || currentMarketRef.current !== market) return;

      try {
        const { getSocketClient } = await import('../client/clients');
        socketRef.current = getSocketClient();
        await socketRef.current.connect();

        if (!isActive || currentMarketRef.current !== market) {
          cleanup();
          return;
        }

        setIsConnected(true);
        setDataSource('websocket');

        unsubRef.current = socketRef.current.subscribeToOrderbook(market, (msg: any) => {
          if (!isActive || !mountedRef.current || currentMarketRef.current !== market) return;
          if (msg.type !== 'channel_data' || !msg.contents) return;

          if (msg.message_id !== undefined) {
            lastMessageId.current = msg.message_id;
          }

          let changed = false;

          if (Array.isArray(msg.contents.bids)) {
            changed = processUpdate(msg.contents.bids, true) || changed;
          }

          if (Array.isArray(msg.contents.asks)) {
            changed = processUpdate(msg.contents.asks, false) || changed;
          }

          if (changed) {
            scheduleUpdate();
          }
        });
      } catch (err) {
        console.error('Websocket connection error:', err);
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
  }, [market, forceUpdate, processUpdate, scheduleUpdate, cleanupState]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  return { orderbook, isConnected, dataSource };
}
