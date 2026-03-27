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

const SNAPSHOT_FRESHNESS_MS = 10_000;
const CACHE_INVALIDATION_MS = 2 * 60 * 1000;

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

function isCacheStale(state: MarketTradeState): boolean {
  if (!state.hasValidSnapshot) return true;
  return Date.now() - state.snapshotLoadedAt > CACHE_INVALIDATION_MS;
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
        s.listeners.forEach(l => l([...s.trades]));
      }
    }
  });
}

function handleTradeUpdate(market: string, data: any): void {
  const contents = data?.contents;
  if (!contents) return;
  const state = getOrCreateState(market, 50);
  const rawTrades: any[] = Array.isArray(contents.trades) ? contents.trades : Array.isArray(contents) ? contents : [];
  if (rawTrades.length === 0) return;

  const latestRaw = rawTrades[0];
  if (latestRaw?.price) {
    useLivePriceStore.getState().setLivePrice(market, parseFloat(latestRaw.price), latestRaw.side as 'BUY' | 'SELL');
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

  const combined = [...newTrades, ...state.trades];
  combined.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  state.trades = combined.slice(0, state.limit);

  if (state.trades[0]) {
    state.newestTradeAt = new Date(state.trades[0].createdAt).getTime();
  }
  scheduleGlobalFlush(market);
}

function subscribeToMarket(market: string): void {
  if (!market) return;
  const state = getOrCreateState(market, 50);
  if (state.isSubscribed) return;
  try {
    state.unsubscribe = getSocketClient().subscribeToTrades(market, data => handleTradeUpdate(market, data));
    state.isSubscribed = true;
  } catch (err) {
    console.error(err);
  }
}

function resetSubscription(market: string, clearData = false): void {
  const state = tradesState.get(market);
  if (!state) return;
  if (state.unsubscribe) {
    try { state.unsubscribe(); } catch { }
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
  if (!state || state.listeners.size > 0) return;
  if (state.unsubscribe) {
    try { state.unsubscribe(); } catch { }
    state.unsubscribe = null;
  }
  state.isSubscribed = false;
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
    const response = await client.markets.getPerpetualMarketTrades(market, undefined, undefined, limit);
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

    const liveIds = new Set(state.trades.map(t => t.id));
    const uniqueSnapshot = mapped.filter(t => !liveIds.has(t.id));
    const combined = [...state.trades, ...uniqueSnapshot];

    combined.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    state.trades = combined.slice(0, limit);
    state.hasValidSnapshot = true;
    state.snapshotLoadedAt = Date.now();

    if (state.trades[0]) {
      state.newestTradeAt = new Date(state.trades[0].createdAt).getTime();
    }
    scheduleGlobalFlush(market);
    return true;
  } catch (err) {
    console.error(err);
    return false;
  }
}

export function useTrades(market: string = 'BTC-USD', limit: number = 50) {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const isConnected = useWebSocketStore(state => state.isConnected);
  const prevMarketRef = useRef<string | null>(null);
  const prevConnectedRef = useRef<boolean>(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible' || !market) return;
      const state = tradesState.get(market);
      if (!state || !isCacheStale(state)) return;
      resetSubscription(market, true);
      setIsLoading(true);
      if (isConnected) subscribeToMarket(market);
      loadSnapshot(market, limit, state.snapshotVersion).then(() => {
        if (mountedRef.current) setIsLoading(false);
      });
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [market, limit, isConnected]);

  useEffect(() => {
    if (!market) {
      setIsLoading(false);
      setTrades([]);
      return;
    }
    const state = getOrCreateState(market, limit);
    const isMarketChange = prevMarketRef.current !== null && prevMarketRef.current !== market;
    const isReconnect = !prevConnectedRef.current && isConnected && prevMarketRef.current === market;

    if (isMarketChange) {
      resetSubscription(prevMarketRef.current!, true);
      setTrades([]);
      setIsLoading(true);
    }
    prevMarketRef.current = market;
    prevConnectedRef.current = isConnected;

    if (isReconnect) {
      resetSubscription(market, false);
      setIsLoading(true);
    }

    const listener = (u: Trade[]) => {
      if (mountedRef.current) {
        setTrades(u);
        setIsLoading(false);
      }
    };
    state.listeners.add(listener);
    if (isConnected) subscribeToMarket(market);

    const snapshotIsFresh = state.hasValidSnapshot && (Date.now() - state.snapshotLoadedAt < SNAPSHOT_FRESHNESS_MS);
    if (state.trades.length === 0 || isReconnect || isMarketChange || !snapshotIsFresh) {
      loadSnapshot(market, limit, state.snapshotVersion).then(() => {
        if (mountedRef.current) setIsLoading(false);
      });
    } else {
      setTrades([...state.trades]);
      setIsLoading(false);
    }

    return () => {
      state.listeners.delete(listener);
      unsubscribeFromMarket(market);
    };
  }, [market, limit, isConnected]);

  return { trades, isLoading, isConnected };
}