import { useEffect, useRef, useState } from 'react';

import { getIndexerClient, getSocketClient } from '../client/clients';
import { useWebSocketStore } from '../store/websocketStore';
import { formatMarketPrice } from '../utils/BigNumberUtils';

interface OrderbookLevel {
  price: string;
  size: string;
}

export interface OrderbookData {
  bids: OrderbookLevel[];
  asks: OrderbookLevel[];
  ts: number;
}

interface MarketOrderbookState {
  bidsMap: Map<number, number>;
  asksMap: Map<number, number>;
  listeners: Set<(data: OrderbookData) => void>;
  unsubscribe: (() => void) | null;
  timeoutId: any | null;
  lastUpdateTs: number;
  isSubscribed: boolean;
  snapshotVersion: number;
}

const orderbookState = new Map<string, MarketOrderbookState>();

function getOrCreateState(market: string): MarketOrderbookState {
  if (!orderbookState.has(market)) {
    orderbookState.set(market, {
      bidsMap: new Map(),
      asksMap: new Map(),
      listeners: new Set(),
      unsubscribe: null,
      timeoutId: null,
      lastUpdateTs: 0,
      isSubscribed: false,
      snapshotVersion: 0,
    });
  }
  return orderbookState.get(market)!;
}

function scheduleUpdate(market: string): void {
  const state = getOrCreateState(market);
  if (state.timeoutId !== null) return;

  const now = Date.now();
  const timeSinceLastUpdate = now - state.lastUpdateTs;
  const throttleDelay = 200; // Update at most once every 200ms

  const runUpdate = () => {
    state.timeoutId = null;
    state.lastUpdateTs = Date.now();

    const sortedBids = Array.from(state.bidsMap.entries())
      .sort(([a], [b]) => b - a)
      .slice(0, 100);

    const sortedAsks = Array.from(state.asksMap.entries())
      .sort(([a], [b]) => a - b)
      .slice(0, 100);

    const data: OrderbookData = {
      bids: sortedBids.map(([price, size]) => ({
        price: price.toString(),
        size: size.toString(),
      })),
      asks: sortedAsks.map(([price, size]) => ({
        price: price.toString(),
        size: size.toString(),
      })),
      ts: Date.now(),
    };

    state.listeners.forEach(listener => listener(data));
  };

  if (timeSinceLastUpdate >= throttleDelay) {
    runUpdate();
  } else {
    state.timeoutId = setTimeout(runUpdate, throttleDelay - timeSinceLastUpdate);
  }
}

function handleOrderbookUpdate(market: string, data: any): void {
  const state = getOrCreateState(market);
  const contents = data?.contents;
  if (!contents) return;

  let changed = false;

  if (data.type === 'subscribed') {
    state.bidsMap.clear();
    state.asksMap.clear();
    changed = true;
  }

  const dataArray = Array.isArray(contents) ? contents : [contents];

  dataArray.forEach((item: any) => {
    if (item.bids?.length) {
      item.bids.forEach((level: [string, string]) => {
        const price = Number(level[0]);
        const size = Number(level[1]);
        if (isNaN(price) || isNaN(size)) return;
        if (size === 0) {
          if (state.bidsMap.delete(price)) changed = true;
        } else {
          state.bidsMap.set(price, size);
          changed = true;
          Array.from(state.asksMap.keys()).forEach(askPrice => {
            if (askPrice <= price) state.asksMap.delete(askPrice);
          });
        }
      });
    }

    if (item.asks?.length) {
      item.asks.forEach((level: [string, string]) => {
        const price = Number(level[0]);
        const size = Number(level[1]);
        if (isNaN(price) || isNaN(size)) return;
        if (size === 0) {
          if (state.asksMap.delete(price)) changed = true;
        } else {
          state.asksMap.set(price, size);
          changed = true;
          Array.from(state.bidsMap.keys()).forEach(bidPrice => {
            if (bidPrice >= price) state.bidsMap.delete(bidPrice);
          });
        }
      });
    }
  });

  if (changed) {
    scheduleUpdate(market);
  }
}

function subscribeToMarket(market: string): void {
  if (!market) return;
  const state = getOrCreateState(market);
  if (state.isSubscribed) return;

  try {
    const socketClient = getSocketClient();
    state.unsubscribe = socketClient.subscribeToOrderbook(market, data =>
      handleOrderbookUpdate(market, data)
    );
    state.isSubscribed = true;
  } catch (err) {
    console.error('[Orderbook] Subscribe error:', err);
  }
}

function resetSubscription(market: string, clearData = false): void {
  const state = orderbookState.get(market);
  if (!state) return;

  if (state.unsubscribe) {
    try {
      state.unsubscribe();
    } catch {
      /* ignore */
    }
    state.unsubscribe = null;
  }
  state.isSubscribed = false;
  if (clearData) {
    state.bidsMap.clear();
    state.asksMap.clear();
  }
  state.snapshotVersion++;

  if (state.timeoutId !== null) {
    clearTimeout(state.timeoutId);
    state.timeoutId = null;
  }
  state.lastUpdateTs = 0;
}

async function loadSnapshot(market: string, version: number): Promise<boolean> {
  if (!market) return false;
  const state = getOrCreateState(market);

  try {
    const indexerClient = getIndexerClient();
    const snap = await indexerClient.markets.getPerpetualMarketOrderbook(market);

    if (state.snapshotVersion !== version) return false;

    state.bidsMap.clear();
    state.asksMap.clear();

    snap?.bids?.forEach((b: { price: string; size: string }) => {
      const price = Number(b.price);
      const size = Number(b.size);
      if (size > 0 && !isNaN(price) && !isNaN(size)) {
        state.bidsMap.set(price, size);
      }
    });

    snap?.asks?.forEach((a: { price: string; size: string }) => {
      const price = Number(a.price);
      const size = Number(a.size);
      if (size > 0 && !isNaN(price) && !isNaN(size)) {
        state.asksMap.set(price, size);
      }
    });

    scheduleUpdate(market);
    return true;
  } catch (err) {
    console.error('[Orderbook] Snapshot error:', err);
    return false;
  }
}

function unsubscribeFromMarket(market: string): void {
  const state = orderbookState.get(market);
  if (!state || state.listeners.size > 0) return;

  if (state.unsubscribe) {
    try {
      state.unsubscribe();
    } catch {
      /* ignore */
    }
    state.unsubscribe = null;
  }
  state.isSubscribed = false;

  if (state.timeoutId !== null) {
    clearTimeout(state.timeoutId);
    state.timeoutId = null;
  }
  state.lastUpdateTs = 0;

  state.bidsMap.clear();
  state.asksMap.clear();
  orderbookState.delete(market);
}

export function useOrderbook(market: string = 'BTC-USD') {
  const [orderbook, setOrderbook] = useState<OrderbookData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isConnected = useWebSocketStore(state => state.isConnected);

  const prevMarketRef = useRef<string | null>(null);
  const prevConnectedRef = useRef<boolean>(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!market) {
      setIsLoading(false);
      setOrderbook(null);
      return;
    }

    const state = getOrCreateState(market);

    const isMarketChange = prevMarketRef.current !== null && prevMarketRef.current !== market;
    const isReconnect =
      !prevConnectedRef.current && isConnected && prevMarketRef.current === market;

    prevMarketRef.current = market;
    prevConnectedRef.current = isConnected;

    if (isMarketChange) {
      resetSubscription(prevMarketRef.current!, true);
      setOrderbook(null);
      setIsLoading(true);
      setError(null);
    } else if (isReconnect) {
      resetSubscription(market, false);
    }

    const listener = (data: OrderbookData) => {
      if (!mountedRef.current) return;
      setOrderbook(data);
      setIsLoading(false);
      setError(null);
    };

    state.listeners.add(listener);

    const version = state.snapshotVersion;
    const needsSnapshot = state.bidsMap.size === 0 || isReconnect;

    if (needsSnapshot) {
      loadSnapshot(market, version).then(success => {
        if (!mountedRef.current) return;
        if (!success && version === state.snapshotVersion) {
          if (!state.isSubscribed) {
            setError('Failed to load orderbook');
            setIsLoading(false);
          }
        } else if (success) {
          setIsLoading(false);
        }
      });
    } else {
      scheduleUpdate(market);
      setIsLoading(false);
    }

    if (isConnected) {
      subscribeToMarket(market);
    }

    return () => {
      state.listeners.delete(listener);
      unsubscribeFromMarket(market);
    };
  }, [market, isConnected]);

  return { orderbook, isConnected, isLoading, error };
}

/**
 * Derives the live mid-market price from the shared orderbook state.
 * Mid price = (bestBid + bestAsk) / 2 — exactly how dYdX's own UI calculates it.
 * Returns `null` until the orderbook has at least one bid and one ask.
 * Also returns `side` ('BUY' | 'SELL' | null) based on whether the mid price
 * moved up or down since the last tick — drives the AnimatedPrice color.
 */
export function useMidMarketPrice(market: string): {
  midPrice: number | null;
  side: 'BUY' | 'SELL' | null;
  formatted: string;
} {
  const [mid, setMid] = useState<number | null>(null);
  const [side, setSide] = useState<'BUY' | 'SELL' | null>(null);
  const prevMidRef = useRef<number | null>(null);

  useEffect(() => {
    if (!market) return;

    const state = getOrCreateState(market);

    const computeMid = () => {
      const bids = state.bidsMap;
      const asks = state.asksMap;
      if (bids.size === 0 || asks.size === 0) return;

      let bestBid = -Infinity;
      for (const k of bids.keys()) if (k > bestBid) bestBid = k;
      let bestAsk = Infinity;
      for (const k of asks.keys()) if (k < bestAsk) bestAsk = k;

      if (bestAsk <= bestBid) return; // crossed book — skip

      const newMid = (bestBid + bestAsk) / 2;

      if (prevMidRef.current !== null && newMid !== prevMidRef.current) {
        setSide(newMid > prevMidRef.current ? 'BUY' : 'SELL');
      }
      prevMidRef.current = newMid;
      setMid(newMid);
    };

    // Register as a listener so we get called on every orderbook update
    state.listeners.add(computeMid as any);

    // Run once immediately in case orderbook data is already cached
    computeMid();

    return () => {
      state.listeners.delete(computeMid as any);
    };
  }, [market]);

  const formatted = mid !== null ? formatMarketPrice(mid) : '--';

  return { midPrice: mid, side, formatted };
}
