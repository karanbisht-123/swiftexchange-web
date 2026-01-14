import { useEffect, useState } from 'react';

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

const orderbookState = new Map<
  string,
  {
    bidsMap: Map<number, number>;
    asksMap: Map<number, number>;
    listeners: Set<(data: OrderbookData) => void>;
    unsubscribe: (() => void) | null;
    rafId: number | undefined;
    isSubscribed: boolean;
  }
>();

function getOrCreateState(market: string) {
  if (!orderbookState.has(market)) {
    orderbookState.set(market, {
      bidsMap: new Map(),
      asksMap: new Map(),
      listeners: new Set(),
      unsubscribe: null,
      rafId: undefined,
      isSubscribed: false,
    });
  }
  return orderbookState.get(market)!;
}

function scheduleUpdate(market: string) {
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

function handleOrderbookUpdate(market: string, data: any) {
  const state = getOrCreateState(market);
  const contents = data?.contents;
  if (!contents) return;

  let changed = false;
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

function subscribeToMarket(market: string, isConnected: boolean) {
  const state = getOrCreateState(market);
  if (state.isSubscribed || !isConnected) return;

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

function unsubscribeFromMarket(market: string) {
  const state = orderbookState.get(market);
  if (!state) return;

  if (state.listeners.size === 0 && state.unsubscribe) {
    state.unsubscribe();
    state.unsubscribe = null;
    state.isSubscribed = false;

    if (state.rafId !== undefined) {
      cancelAnimationFrame(state.rafId);
      state.rafId = undefined;
    }

    state.bidsMap.clear();
    state.asksMap.clear();
    orderbookState.delete(market);
  }
}

async function loadSnapshot(market: string) {
  const state = getOrCreateState(market);
  if (state.bidsMap.size > 0 || state.asksMap.size > 0) return;

  try {
    const { getIndexerClient } = await import('../client/clients');
    const snap = await getIndexerClient().markets.getPerpetualMarketOrderbook(market);

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
  } catch (err) {
    console.error('[Orderbook] Snapshot error:', err);
  }
}

export function useOrderbook(market: string = 'BTC-USD') {
  const [orderbook, setOrderbook] = useState<OrderbookData | null>(null);
  const [dataSource, setDataSource] = useState<'api' | 'websocket' | null>(null);
  const isConnected = useWebSocketStore(state => state.isConnected);

  useEffect(() => {
    const state = getOrCreateState(market);

    const listener = (data: OrderbookData) => {
      setOrderbook(data);
      setDataSource('websocket');
    };

    state.listeners.add(listener);

    loadSnapshot(market).then(() => {
      setDataSource('api');
    });

    subscribeToMarket(market, isConnected);

    return () => {
      state.listeners.delete(listener);
      unsubscribeFromMarket(market);
    };
  }, [market, isConnected]);

  return { orderbook, isConnected, dataSource };
}
