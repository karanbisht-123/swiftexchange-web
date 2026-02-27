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

interface MarketOrderbookState {
  bidsMap: Map<number, number>;
  asksMap: Map<number, number>;
  listeners: Set<(data: OrderbookData) => void>;
  unsubscribe: (() => void) | null;
  rafId: number | undefined;
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
      rafId: undefined,
      isSubscribed: false,
      snapshotVersion: 0,
    });
  }
  return orderbookState.get(market)!;
}

function scheduleUpdate(market: string): void {
  const state = getOrCreateState(market);
  if (state.rafId !== undefined) return;

  state.rafId = requestAnimationFrame(() => {
    state.rafId = undefined;

    const sortedBids = Array.from(state.bidsMap.entries())
      .sort(([a], [b]) => b - a)
      .slice(0, 9);

    const sortedAsks = Array.from(state.asksMap.entries())
      .sort(([a], [b]) => a - b)
      .slice(0, 9);

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
  });
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

function resetSubscription(market: string): void {
  const state = orderbookState.get(market);
  if (!state) return;

  if (state.unsubscribe) {
    try { state.unsubscribe(); } catch { /* ignore */ }
    state.unsubscribe = null;
  }
  state.isSubscribed = false;
  state.bidsMap.clear();
  state.asksMap.clear();
  state.snapshotVersion++;

  if (state.rafId !== undefined) {
    cancelAnimationFrame(state.rafId);
    state.rafId = undefined;
  }
}

function unsubscribeFromMarket(market: string): void {
  const state = orderbookState.get(market);
  if (!state || state.listeners.size > 0) return;

  if (state.unsubscribe) {
    try { state.unsubscribe(); } catch { /* ignore */ }
    state.unsubscribe = null;
  }
  state.isSubscribed = false;

  if (state.rafId !== undefined) {
    cancelAnimationFrame(state.rafId);
    state.rafId = undefined;
  }

  state.bidsMap.clear();
  state.asksMap.clear();
  orderbookState.delete(market);
}

async function loadSnapshot(market: string, version: number): Promise<boolean> {
  if (!market) return false;
  const state = getOrCreateState(market);

  try {
    const { getIndexerClient } = await import('../client/clients');
    const snap = await getIndexerClient().markets.getPerpetualMarketOrderbook(market);

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
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!market) {
      setIsLoading(false);
      setOrderbook(null);
      return;
    }

    const state = getOrCreateState(market);

    const isMarketChange = prevMarketRef.current !== null && prevMarketRef.current !== market;
    const isReconnect = !prevConnectedRef.current && isConnected && prevMarketRef.current === market;

    prevMarketRef.current = market;
    prevConnectedRef.current = isConnected;

    if (isMarketChange || isReconnect) {
      resetSubscription(market);
      setOrderbook(null);
      setIsLoading(true);
      setError(null);
    }

    const listener = (data: OrderbookData) => {
      if (!mountedRef.current) return;
      setOrderbook(data);
      setIsLoading(false);
      setError(null);
    };

    state.listeners.add(listener);

    const version = state.snapshotVersion;

    loadSnapshot(market, version).then(success => {
      if (!mountedRef.current) return;
      if (!success && version === state.snapshotVersion) {
        setError('Failed to load orderbook');
        setIsLoading(false);
      }
    });

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
