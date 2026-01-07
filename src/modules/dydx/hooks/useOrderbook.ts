import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useWebSocketStore } from '../store/websocketStore';

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

const MAX_DEPTH = 50;
const DISPLAY_LIMIT = 15;

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
  const [dataSource, setDataSource] = useState<'api' | 'websocket' | null>(null);

  const stateRef = useRef<InternalOrderbookState>({
    bidsMap: new Map(),
    asksMap: new Map(),
    bidsSorted: [],
    asksSorted: [],
  });

  const rafId = useRef<number | null>(null);
  const pendingUpdate = useRef(false);
  const mountedRef = useRef(true);
  const currentMarketRef = useRef(market);
  const initCompleteRef = useRef(false);

  // Get store methods and state
  const subscribeToOrderbook = useWebSocketStore(state => state.subscribeToOrderbook);
  const unsubscribeFromOrderbook = useWebSocketStore(state => state.unsubscribeFromOrderbook);
  const isConnected = useWebSocketStore(state => state.isConnected);
  const storeOrderbook = useWebSocketStore(state => state.orderbooks.get(market));

  const cleanupState = useCallback(() => {
    stateRef.current.bidsMap.clear();
    stateRef.current.asksMap.clear();
    stateRef.current.bidsSorted = [];
    stateRef.current.asksSorted = [];
    pendingUpdate.current = false;
  }, []);

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

  // Process orderbook updates from store
  const processLevels = useCallback((levels: Array<[string, string]>, isBid: boolean) => {
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

  // Load initial snapshot from REST API
  useEffect(() => {
    let isActive = true;
    mountedRef.current = true;
    currentMarketRef.current = market;
    cleanupState();
    setOrderbook(null);
    setDataSource(null);
    initCompleteRef.current = false;

    if (rafId.current !== null) {
      cancelAnimationFrame(rafId.current);
      rafId.current = null;
    }

    const initSnapshot = async () => {
      if (!isActive || currentMarketRef.current !== market) return;

      try {
        const { getIndexerClient } = await import('../client/clients');
        const client = getIndexerClient();
        const snap = await client.markets.getPerpetualMarketOrderbook(market);

        if (!isActive || currentMarketRef.current !== market) return;

        const state = stateRef.current;

        if (snap?.bids) {
          snap.bids.forEach((b: { price: string; size: string }) => {
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
          snap.asks.forEach((a: { price: string; size: string }) => {
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

    initSnapshot();

    return () => {
      isActive = false;
      if (rafId.current !== null) {
        cancelAnimationFrame(rafId.current);
        rafId.current = null;
      }
      cleanupState();
    };
  }, [market, cleanupState, forceUpdate]);

  // Subscribe to WebSocket updates via store
  useEffect(() => {
    currentMarketRef.current = market;

    // Subscribe to orderbook for this market
    subscribeToOrderbook(market);

    return () => {
      unsubscribeFromOrderbook(market);
    };
  }, [market, subscribeToOrderbook, unsubscribeFromOrderbook]);

  // Process store orderbook updates
  useEffect(() => {
    if (!storeOrderbook || !initCompleteRef.current) return;

    let changed = false;

    if (storeOrderbook.bids && storeOrderbook.bids.length > 0) {
      if (processLevels(storeOrderbook.bids, true)) changed = true;
    }

    if (storeOrderbook.asks && storeOrderbook.asks.length > 0) {
      if (processLevels(storeOrderbook.asks, false)) changed = true;
    }

    if (changed) {
      setDataSource('websocket');
      scheduleUpdate();
    }
  }, [storeOrderbook, processLevels, scheduleUpdate]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  return { orderbook, isConnected, dataSource };
}
