import { useEffect, useMemo, useRef, useState } from 'react';

import { getSocketClient } from '../client/clients';
import { useWebSocketStore } from '../store/websocketStore';

interface Trade {
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
  rafId: number | undefined;
  isSubscribed: boolean;
  limit: number;
  snapshotVersion: number;
}

const tradesState = new Map<string, MarketTradeState>();

function getOrCreateState(market: string, limit: number): MarketTradeState {
  if (!tradesState.has(market)) {
    tradesState.set(market, {
      trades: [],
      listeners: new Set(),
      unsubscribe: null,
      rafId: undefined,
      isSubscribed: false,
      limit,
      snapshotVersion: 0,
    });
  }
  return tradesState.get(market)!;
}

function scheduleUpdate(market: string): void {
  const state = getOrCreateState(market, 50);
  if (state.rafId !== undefined) return;
  state.rafId = requestAnimationFrame(() => {
    state.rafId = undefined;
    state.listeners.forEach(listener => listener([...state.trades]));
  });
}

function handleTradeUpdate(market: string, data: any): void {
  const state = getOrCreateState(market, 50);
  const contents = data?.contents;

  if (!contents?.trades || !Array.isArray(contents.trades)) return;

  const existingIds = new Set(state.trades.map(t => t.id));

  const newTrades: Trade[] = contents.trades
    .filter((t: any) => t?.id && !existingIds.has(t.id))
    .map((t: any) => ({
      id: t.id,
      side: t.side as 'BUY' | 'SELL',
      size: t.size,
      price: t.price,
      createdAt: t.createdAt,
    }));

  if (newTrades.length > 0) {
    for (let i = newTrades.length - 1; i >= 0; i--) {
      state.trades.unshift(newTrades[i]);
    }
    if (state.trades.length > state.limit) {
      state.trades.length = state.limit;
    }

    const latestTrade = state.trades[0];
    import('../store/useLivePriceStore').then(module => {
      module.useLivePriceStore.getState().setLivePrice(market, parseFloat(latestTrade.price), latestTrade.side);
    });

    scheduleUpdate(market);
  }
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
  }
  state.snapshotVersion++;

  if (state.rafId !== undefined) {
    cancelAnimationFrame(state.rafId);
    state.rafId = undefined;
  }
}

function unsubscribeFromMarket(market: string): void {
  const state = tradesState.get(market);
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

  state.trades = [];
  tradesState.delete(market);
}

async function loadSnapshot(
  market: string,
  limit: number,
  version: number
): Promise<boolean> {
  if (!market) return false;
  const state = getOrCreateState(market, limit);

  try {
    const { getIndexerClient } = await import('../client/clients');
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

    state.trades = mapped.slice(0, limit);
    scheduleUpdate(market);
    return true;
  } catch (err) {
    console.error('[Trades] Snapshot error:', err);
    return false;
  }
}

export function useTrades(market: string = 'BTC-USD', limit: number = 50) {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [isLoading, setIsLoading] = useState(!!market);
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
    const isReconnect = !prevConnectedRef.current && isConnected && prevMarketRef.current === market;

    prevMarketRef.current = market;
    prevConnectedRef.current = isConnected;

    if (isMarketChange) {
      setTrades([...state.trades]);
      setIsLoading(state.trades.length === 0);
      setError(null);
    } else if (isReconnect) {
      resetSubscription(market, false);
      setIsLoading(true);
      setError(null);
    } else if (state.trades.length > 0) {
      setTrades([...state.trades]);
      setIsLoading(false);
    }

    const listener = (updatedTrades: Trade[]) => {
      if (!mountedRef.current) return;
      setTrades(updatedTrades);
      setIsLoading(false);
      setError(null);
    };

    state.listeners.add(listener);

    const version = state.snapshotVersion;
    const needsSnapshot = state.trades.length === 0 || isReconnect;

    if (needsSnapshot) {
      loadSnapshot(market, limit, version).then(success => {
        if (!mountedRef.current) return;
        if (success) {
          const current = tradesState.get(market);
          if (current && current.trades.length > 0) {
            setTrades([...current.trades]);
          }
          setIsLoading(false);
        } else if (!success && version === state.snapshotVersion) {
          setError('Failed to load trades');
          setIsLoading(false);
        }
      });
    } else {
      setIsLoading(false);
    }

    if (isConnected) {
      subscribeToMarket(market);
    }

    return () => {
      state.listeners.delete(listener);
      unsubscribeFromMarket(market);
    };
  }, [market, limit, isConnected]);

  const livePrice = useMemo(() => {
    return trades.length > 0 ? parseFloat(trades[0].price) : null;
  }, [trades]);

  const livePriceSide = useMemo(() => {
    return trades.length > 0 ? trades[0].side : null;
  }, [trades]);

  return {
    trades,
    isLoading,
    isConnected,
    error,
    livePrice,
    livePriceSide,
  };
}
