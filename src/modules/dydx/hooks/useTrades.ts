
import { useEffect, useRef, useState } from 'react';
import { getSocketClient } from '../client/clients';
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
}

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
        s.listeners.forEach(l => l([...s.trades]));
      }
    }
  });
}

function handleTradeUpdate(market: string, data: any): void {
  const contents = data?.contents;
  if (!contents) return;
  const state = getOrCreateState(market, 50);
  const rawTrades: any[] = Array.isArray(contents)
    ? contents.flatMap((c: any) => c?.trades || (c?.id ? [c] : []))
    : (contents.trades || []);
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
  }
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
      resetSubscription(market, true);
      setTrades([]);
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

    if (state.trades.length > 0) {
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