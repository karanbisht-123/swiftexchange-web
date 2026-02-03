import { useEffect, useMemo, useState } from 'react';

import { getSocketClient } from '../client/clients';
import { useWebSocketStore } from '../store/websocketStore';

interface Trade {
  id: string;
  side: 'BUY' | 'SELL';
  size: string;
  price: string;
  createdAt: string;
}

const tradesState = new Map<
  string,
  {
    trades: Trade[];
    listeners: Set<(trades: Trade[]) => void>;
    unsubscribe: (() => void) | null;
    rafId: number | undefined;
    isSubscribed: boolean;
    limit: number;
    hasLoadedSnapshot: boolean;
  }
>();

function getOrCreateState(market: string, limit: number) {
  if (!tradesState.has(market)) {
    tradesState.set(market, {
      trades: [],
      listeners: new Set(),
      unsubscribe: null,
      rafId: undefined,
      isSubscribed: false,
      limit,
      hasLoadedSnapshot: false,
    });
  }
  return tradesState.get(market)!;
}

function scheduleUpdate(market: string) {
  const state = getOrCreateState(market, 50);

  if (state.rafId !== undefined) return;

  state.rafId = requestAnimationFrame(() => {
    state.rafId = undefined;
    state.listeners.forEach(listener => listener([...state.trades]));
  });
}

function handleTradeUpdate(market: string, data: any) {
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
    state.trades = [...newTrades, ...state.trades].slice(0, state.limit);
    scheduleUpdate(market);
  }
}

function subscribeToMarket(market: string, isConnected: boolean) {
  const state = getOrCreateState(market, 50);
  if (state.isSubscribed || !isConnected) return;

  try {
    const socketClient = getSocketClient();
    state.unsubscribe = socketClient.subscribeToTrades(market, data =>
      handleTradeUpdate(market, data)
    );
    state.isSubscribed = true;
    console.log(`[Trades] Subscribed to ${market}`);
  } catch (err) {
    console.error('[Trades] Subscribe error:', err);
  }
}

function unsubscribeFromMarket(market: string) {
  const state = tradesState.get(market);
  if (!state) return;

  if (state.listeners.size === 0 && state.unsubscribe) {
    state.unsubscribe();
    state.unsubscribe = null;
    state.isSubscribed = false;

    if (state.rafId !== undefined) {
      cancelAnimationFrame(state.rafId);
      state.rafId = undefined;
    }

    state.trades = [];
    state.hasLoadedSnapshot = false;
    tradesState.delete(market);
    console.log(`[Trades] Unsubscribed from ${market}`);
  }
}

async function loadSnapshot(market: string, limit: number) {
  const state = getOrCreateState(market, limit);
  if (state.hasLoadedSnapshot) {
    scheduleUpdate(market);
    return;
  }

  try {
    const { getIndexerClient } = await import('../client/clients');
    const client = getIndexerClient();

    let response;
    try {
      response = await client.markets.getPerpetualMarketTrades(market, undefined, undefined, limit);
    } catch {
      response = await client.markets.getPerpetualMarketTrades(market);
    }

    const mappedTrades: Trade[] = (response?.trades || [])
      .filter((trade: { id?: string }) => trade?.id)
      .map(
        (trade: {
          id: string;
          side: 'BUY' | 'SELL';
          size: string;
          price: string;
          createdAt: string;
        }) => ({
          id: trade.id,
          side: trade.side,
          size: trade.size,
          price: trade.price,
          createdAt: trade.createdAt,
        })
      );

    state.trades = mappedTrades.slice(0, limit);
    state.hasLoadedSnapshot = true;
    scheduleUpdate(market);
  } catch (err) {
    console.error('[Trades] Snapshot error:', err);
  }
}

export function useTrades(market: string = 'BTC-USD', limit: number = 50) {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [dataSource, setDataSource] = useState<'api' | 'websocket' | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const isConnected = useWebSocketStore(state => state.isConnected);

  useEffect(() => {
    const state = getOrCreateState(market, limit);
    state.limit = limit;

    // If we already have data from a previous mount, use it immediately
    if (state.trades.length > 0) {
      setTrades([...state.trades]);
      setDataSource(state.isSubscribed ? 'websocket' : 'api');
      setIsLoading(false);
    } else {
      setIsLoading(true);
    }

    const listener = (updatedTrades: Trade[]) => {
      setTrades(updatedTrades);
      setDataSource('websocket');
      setIsLoading(false);
    };

    state.listeners.add(listener);

    if (!state.hasLoadedSnapshot) {
      loadSnapshot(market, limit).then(() => {
        if (state.trades.length > 0) {
          setTrades([...state.trades]);
          setDataSource('api');
        }
        setIsLoading(false);
      });
    }

    subscribeToMarket(market, isConnected);

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
    dataSource,
    livePrice,
    livePriceSide,
  };
}
