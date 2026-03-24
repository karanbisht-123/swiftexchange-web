import { useEffect, useRef, useState } from 'react';

import { getIndexerClient, getSocketClient } from '../client/clients';
import { useLivePriceStore } from '../store/useLivePriceStore';
import { useWebSocketStore } from '../store/websocketStore';

export interface Trade {
  id: string;
  side: 'BUY' | 'SELL';
  size: string;
  price: string;
  createdAt: string;
}

interface MarketTradeState {
  trades: Trade[];
  listeners: Set<(trades: Trade[]) => void>;
  unsubscribe: (() => void) | null;
  isSubscribed: boolean;
  limit: number;
  snapshotVersion: number;
  hasValidSnapshot: boolean;
  snapshotLoadedAt: number;
  newestTradeAt: number;
}

const SNAPSHOT_FRESHNESS_MS = 30_000;

let globalRafId: number | undefined;
const pendingFlush = new Set<string>();

export const tradesState = new Map<string, MarketTradeState>();

function getOrCreateState(market: string, limit: number): MarketTradeState {
  if (!tradesState.has(market)) {
    tradesState.set(market, {
      trades: [],
      listeners: new Set(),
      unsubscribe: null,
      isSubscribed: false,
      limit,
      snapshotVersion: 0,
      hasValidSnapshot: false,
      snapshotLoadedAt: 0,
      newestTradeAt: 0,
    });
  }
  return tradesState.get(market)!;
}

function scheduleGlobalFlush(market: string): void {
  pendingFlush.add(market);
  if (globalRafId !== undefined) return;
  globalRafId = requestAnimationFrame(() => {
    globalRafId = undefined;
    const toFlush = [...pendingFlush];
    pendingFlush.clear();
    for (const m of toFlush) {
      const s = tradesState.get(m);
      if (s && s.listeners.size > 0) {
        const snapshot = [...s.trades];
        s.listeners.forEach(listener => listener(snapshot));
      }
    }
  });
}

function handleTradeUpdate(market: string, data: any): void {
  const contents = data?.contents;
  if (!contents) return;

  const state = getOrCreateState(market, 50);


  const rawTrades: any[] = Array.isArray(contents.trades)
    ? contents.trades
    : Array.isArray(contents)
      ? contents
      : [];

  if (rawTrades.length === 0) return;


  const latestRaw = rawTrades[0];
  if (latestRaw?.price) {
    useLivePriceStore
      .getState()
      .setLivePrice(market, parseFloat(latestRaw.price), latestRaw.side as 'BUY' | 'SELL');
  }

  const existingIds = new Set(state.trades.map(t => t.id));
  const newTrades: Trade[] = rawTrades
    .filter((t: any) => t?.id && !existingIds.has(t.id))
    .map((t: any) => ({
      id: t.id,
      side: t.side as 'BUY' | 'SELL',
      size: t.size,
      price: t.price,
      createdAt: t.createdAt,
    }));

  if (newTrades.length === 0) return;
  for (let i = newTrades.length - 1; i >= 0; i--) {
    state.trades.unshift(newTrades[i]);
  }
  if (state.trades.length > state.limit) {
    state.trades.length = state.limit;
  }

  if (state.trades[0]?.createdAt) {
    const ts = new Date(state.trades[0].createdAt).getTime();
    if (ts > state.newestTradeAt) state.newestTradeAt = ts;
  }

  scheduleGlobalFlush(market);
}

function subscribeToMarket(market: string): void {
  if (!market) return;
  const state = getOrCreateState(market, 50);
  if (state.isSubscribed) return;
  try {
    const socketClient = getSocketClient();
    state.unsubscribe = socketClient.subscribeToTrades(market, data =>
      handleTradeUpdate(market, data)
    );
    state.isSubscribed = true;
  } catch (err) {
    console.error('[Trades] Subscribe error:', err);
  }
}

function resetSubscription(market: string, clearData = false): void {
  const state = tradesState.get(market);
  if (!state) return;
  if (state.unsubscribe) {
    try { state.unsubscribe(); } catch { /* ignore */ }
    state.unsubscribe = null;
  }
  state.isSubscribed = false;
  if (clearData) {
    state.trades = [];
    state.hasValidSnapshot = false;
    state.snapshotLoadedAt = 0;
    state.newestTradeAt = 0;
  }
  state.snapshotVersion++;
  pendingFlush.delete(market);
}

function unsubscribeFromMarket(market: string): void {
  const state = tradesState.get(market);
  if (!state) return;
  if (state.listeners.size > 0) return;
  if (state.unsubscribe) {
    try { state.unsubscribe(); } catch { /* ignore */ }
    state.unsubscribe = null;
  }
  state.isSubscribed = false;
  pendingFlush.delete(market);
  state.trades = [];
  state.hasValidSnapshot = false;
  state.snapshotLoadedAt = 0;
  state.newestTradeAt = 0;
}

async function loadSnapshot(market: string, limit: number, version: number): Promise<boolean> {
  if (!market) return false;
  const state = getOrCreateState(market, limit);

  try {
    const client = getIndexerClient();
    let response: any;
    try {
      response = await client.markets.getPerpetualMarketTrades(market, undefined, undefined, limit);
    } catch {
      response = await client.markets.getPerpetualMarketTrades(market);
    }

    if (state.snapshotVersion !== version) return false;

    const mapped: Trade[] = (response?.trades || [])
      .filter((t: any) => t?.id)
      .map((t: any) => ({
        id: t.id,
        side: t.side as 'BUY' | 'SELL',
        size: t.size,
        price: t.price,
        createdAt: t.createdAt,
      }));

    if (mapped.length === 0) {
      state.hasValidSnapshot = true;
      state.snapshotLoadedAt = Date.now();
      return true;
    }

    const newestSnapshotAt = new Date(mapped[0].createdAt).getTime();

    const liveIds = new Set(state.trades.map(t => t.id));
    const restOnly = mapped.filter(t => !liveIds.has(t.id));

    if (state.newestTradeAt > 0 && state.newestTradeAt >= newestSnapshotAt) {
      state.trades = [...state.trades, ...restOnly].slice(0, limit);
    } else {
      state.trades = [...state.trades, ...restOnly].slice(0, limit);
    }

    state.hasValidSnapshot = true;
    state.snapshotLoadedAt = Date.now();

    if (state.trades.length > 0) {
      const existing = useLivePriceStore.getState().prices[market];
      if (!existing) {
        const top = state.trades[0];
        useLivePriceStore.getState().setLivePrice(market, parseFloat(top.price), top.side);
      }
    }

    if (state.listeners.size > 0) {
      scheduleGlobalFlush(market);
    }
    return true;
  } catch (err) {
    console.error('[Trades] Snapshot error:', err);
    return false;
  }
}

export function useTrades(market: string = 'BTC-USD', limit: number = 50) {
  const [trades, setTrades] = useState<Trade[]>(() => {
    const cached = tradesState.get(market);
    if (cached?.hasValidSnapshot && cached.trades.length > 0) return [...cached.trades];
    return [];
  });

  const [isLoading, setIsLoading] = useState(() => {
    if (!market) return false;
    const cached = tradesState.get(market);
    return !(cached?.hasValidSnapshot && cached.trades.length > 0);
  });

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
      setTrades([]);
      return;
    }

    const state = getOrCreateState(market, limit);
    state.limit = limit;

    const isMarketChange = prevMarketRef.current !== null && prevMarketRef.current !== market;
    const isReconnect =
      !prevConnectedRef.current && isConnected && prevMarketRef.current === market;

    prevMarketRef.current = market;
    prevConnectedRef.current = isConnected;

    const snapshotAge = Date.now() - state.snapshotLoadedAt;
    const snapshotIsFresh = state.hasValidSnapshot && snapshotAge < SNAPSHOT_FRESHNESS_MS;

    if (state.trades.length > 0) {
      setTrades([...state.trades]);
      setIsLoading(false);
      setError(null);
    } else if (isMarketChange) {
      setTrades([]);
      setIsLoading(true);
      setError(null);
    } else if (isReconnect) {
      resetSubscription(market, false);
      setIsLoading(true);
      setError(null);
    }
    const listener = (updatedTrades: Trade[]) => {
      if (!mountedRef.current) return;
      setTrades(updatedTrades);
      setIsLoading(false);
      setError(null);
    };
    state.listeners.add(listener);
    if (isConnected) {
      subscribeToMarket(market);
    }

    const needsSnapshot =
      state.trades.length === 0 || isReconnect || (!snapshotIsFresh && isMarketChange);

    if (needsSnapshot) {
      const version = state.snapshotVersion;
      loadSnapshot(market, limit, version).then(success => {
        if (!mountedRef.current) return;
        if (success) {
          const current = tradesState.get(market);
          if (current && current.trades.length > 0) {
            setTrades(prev => {
              if (prev.length === 0) return [...current.trades];
              const currentNewest = current.trades[0]?.createdAt ?? '';
              const prevNewest = prev[0]?.createdAt ?? '';
              return currentNewest >= prevNewest ? [...current.trades] : prev;
            });
          }
          setIsLoading(false);
        } else if (version === state.snapshotVersion) {
          setError('Failed to load trades');
          setIsLoading(false);
        }
      });
    } else {
      setIsLoading(false);
    }

    return () => {
      state.listeners.delete(listener);
      unsubscribeFromMarket(market);
    };
  }, [market, limit, isConnected]);

  const livePrice = trades.length > 0 ? parseFloat(trades[0].price) : null;
  const livePriceSide = trades.length > 0 ? trades[0].side : null;

  return { trades, isLoading, isConnected, error, livePrice, livePriceSide };
}