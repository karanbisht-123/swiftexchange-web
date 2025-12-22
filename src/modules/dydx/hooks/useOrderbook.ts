import { useCallback, useEffect, useRef, useState } from 'react';

// ================= TYPES =================

interface OrderbookLevel {
  price: string;
  size: string;
}

export interface OrderbookData {
  bids: OrderbookLevel[];
  asks: OrderbookLevel[];
  ts: number;
  messageId?: number;
}

interface InternalOrderbookState {
  bidsMap: Map<number, number>;
  asksMap: Map<number, number>;
  bidsSorted: number[];
  asksSorted: number[];
}

// ================= CONSTANTS =================

const MAX_DEPTH = 50; // Internal memory
const DISPLAY_LIMIT = 15; // How many rows to render

function insertSorted(arr: number[], price: number, isBid: boolean) {
  let low = 0;
  let high = arr.length;

  if (isBid) {
    while (low < high) {
      const mid = (low + high) >>> 1;
      if (arr[mid] > price) low = mid + 1;
      else high = mid;
    }
  } else {
    while (low < high) {
      const mid = (low + high) >>> 1;
      if (arr[mid] < price) low = mid + 1;
      else high = mid;
    }
  }

  arr.splice(low, 0, price);
}

// ================= HOOK =================

export function useOrderbook(market: string = 'BTC-USD') {
  const [orderbook, setOrderbook] = useState<OrderbookData | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [dataSource, setDataSource] = useState<'api' | 'websocket' | null>(null);

  // Mutable ref for high-frequency data
  const stateRef = useRef<InternalOrderbookState>({
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
  const isSubscribedRef = useRef(false);
  const initCompleteRef = useRef(false);

  // --------------------------------------------------------
  // 1. STATE MANAGEMENT
  // --------------------------------------------------------

  const cleanupState = useCallback(() => {
    stateRef.current.bidsMap.clear();
    stateRef.current.asksMap.clear();
    stateRef.current.bidsSorted = [];
    stateRef.current.asksSorted = [];
    lastMessageId.current = 0;
    pendingUpdate.current = false;
  }, []);

  // --------------------------------------------------------
  // 2. RENDERING (Throttled by RequestAnimationFrame)
  // --------------------------------------------------------

  const forceUpdate = useCallback(() => {
    if (!mountedRef.current) return;

    const ts = Date.now();
    const state = stateRef.current;

    const newBids: OrderbookLevel[] = state.bidsSorted.slice(0, DISPLAY_LIMIT).map(price => ({
      price: price.toString(),
      size: state.bidsMap.get(price)?.toString() || '0',
    }));

    const newAsks: OrderbookLevel[] = state.asksSorted.slice(0, DISPLAY_LIMIT).map(price => ({
      price: price.toString(),
      size: state.asksMap.get(price)?.toString() || '0',
    }));
    newAsks.reverse();

    setOrderbook({
      bids: newBids,
      asks: newAsks,
      ts,
      messageId: lastMessageId.current,
    });
  }, []);

  const scheduleUpdate = useCallback(() => {
    if (pendingUpdate.current || !mountedRef.current) return;

    pendingUpdate.current = true;
    if (rafId.current !== null) {
      cancelAnimationFrame(rafId.current);
    }

    rafId.current = requestAnimationFrame(() => {
      pendingUpdate.current = false;
      if (mountedRef.current) {
        forceUpdate();
      }
    });
  }, [forceUpdate]);

  // --------------------------------------------------------
  // 3. DATA PROCESSING
  // --------------------------------------------------------

  const processUpdate = useCallback((levels: [string, string][], isBid: boolean) => {
    if (!mountedRef.current) return false;

    const state = stateRef.current;
    const map = isBid ? state.bidsMap : state.asksMap;
    const sorted = isBid ? state.bidsSorted : state.asksSorted;
    let changed = false;

    for (let i = 0; i < levels.length; i++) {
      const [priceStr, sizeStr] = levels[i];
      const price = Number(priceStr);
      const size = Number(sizeStr);
      const prevSize = map.get(price);

      if (size <= 0) {
        if (prevSize !== undefined) {
          map.delete(price);
          const idx = sorted.indexOf(price);
          if (idx !== -1) {
            sorted.splice(idx, 1);
          }
          changed = true;
        }
      } else if (prevSize !== size) {
        map.set(price, size);
        if (prevSize === undefined) {
          insertSorted(sorted, price, isBid);
        }
        changed = true;
      }
    }
    if (sorted.length > MAX_DEPTH) {
      for (let i = MAX_DEPTH; i < sorted.length; i++) {
        map.delete(sorted[i]);
      }
      sorted.length = MAX_DEPTH;
    }
    if (isBid) state.bidsSorted = sorted;
    else state.asksSorted = sorted;

    return changed;
  }, []);

  // --------------------------------------------------------
  // 4. CONNECTION EFFECTS
  // --------------------------------------------------------

  useEffect(() => {
    let isActive = true;
    mountedRef.current = true;
    currentMarketRef.current = market;
    cleanupState();
    setOrderbook(null);
    setIsConnected(false);
    setDataSource(null);
    initCompleteRef.current = false;
    isSubscribedRef.current = false;

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
        } catch (e) {}
        unsubRef.current = null;
      }
      isSubscribedRef.current = false;
      socketRef.current = null;
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
            const price = Number(b.price);
            const size = Number(b.size);
            if (size > 0) {
              state.bidsMap.set(price, size);
              state.bidsSorted.push(price);
            }
          });
          state.bidsSorted.sort((a, b) => b - a);
        }

        if (snap?.asks) {
          snap.asks.forEach((a: any) => {
            const price = Number(a.price);
            const size = Number(a.size);
            if (size > 0) {
              state.asksMap.set(price, size);
              state.asksSorted.push(price);
            }
          });
          state.asksSorted.sort((a, b) => a - b);
        }
        if (state.bidsSorted.length > MAX_DEPTH) state.bidsSorted.length = MAX_DEPTH;
        if (state.asksSorted.length > MAX_DEPTH) state.asksSorted.length = MAX_DEPTH;

        if (isActive && mountedRef.current) {
          forceUpdate();
          setDataSource('api');
          initCompleteRef.current = true;
        }
      } catch (err) {
        console.error('[useOrderbook] Snapshot error:', err);
      }
    };

    const connectWebSocket = async () => {
      if (!isActive || !initCompleteRef.current || currentMarketRef.current !== market) return;
      if (isSubscribedRef.current) return;

      try {
        const { getSocketClient } = await import('../client/clients');
        socketRef.current = getSocketClient();
        if (!socketRef.current.isConnected?.()) {
          await socketRef.current.connect();
        }

        if (!isActive || currentMarketRef.current !== market) {
          cleanup();
          return;
        }

        setIsConnected(true);
        setDataSource('websocket');
        isSubscribedRef.current = true;
        unsubRef.current = socketRef.current.subscribeToOrderbook(
          market,
          (msg: any) => {
            if (!isActive || !mountedRef.current || currentMarketRef.current !== market) return;
            if (msg.type !== 'channel_data' || !msg.contents) return;

            if (msg.message_id !== undefined) {
              lastMessageId.current = msg.message_id;
            }

            let changed = false;

            if (Array.isArray(msg.contents.bids)) {
              if (processUpdate(msg.contents.bids, true)) changed = true;
            }

            if (Array.isArray(msg.contents.asks)) {
              if (processUpdate(msg.contents.asks, false)) changed = true;
            }

            if (changed) {
              scheduleUpdate();
            }
          },
          false
        );
      } catch (err) {
        console.error('[useOrderbook] WebSocket error:', err);
        if (isActive) {
          setIsConnected(false);
          isSubscribedRef.current = false;
        }
      }
    };
    initSnapshot().then(() => {
      if (isActive && initCompleteRef.current) {
        connectWebSocket();
      }
    });

    return cleanup;
  }, [market, cleanupState, forceUpdate, processUpdate, scheduleUpdate]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  return { orderbook, isConnected, dataSource };
}
