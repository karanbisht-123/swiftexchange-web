import { create } from 'zustand';

import type { Trade } from '../models';

const MAX_TRADES_PER_SYMBOL = 100;

interface TradeStoreState {
  tradesBySymbol: Record<string, Trade[]>;
  addTrades: (symbol: string, incoming: Trade[]) => void;
  getTrades: (symbol: string) => Trade[];
  clear: (symbol?: string) => void;
}

export const useTradeStore = create<TradeStoreState>((set, get) => ({
  tradesBySymbol: {},

  addTrades: (symbol, incoming) => {
    const existing = get().tradesBySymbol[symbol] ?? [];
    const combined = [...incoming, ...existing];

    // Deduplicate by ID, keep newest first
    const seen = new Set<string>();
    const deduped = combined.filter(t => {
      if (seen.has(t.id)) return false;
      seen.add(t.id);
      return true;
    });

    deduped.sort((a, b) => b.timestamp - a.timestamp);

    set(state => ({
      tradesBySymbol: {
        ...state.tradesBySymbol,
        [symbol]: deduped.slice(0, MAX_TRADES_PER_SYMBOL),
      },
    }));
  },

  getTrades: symbol => get().tradesBySymbol[symbol] ?? [],

  clear: symbol => {
    if (symbol) {
      set(state => {
        const next = { ...state.tradesBySymbol };
        delete next[symbol];
        return { tradesBySymbol: next };
      });
    } else {
      set({ tradesBySymbol: {} });
    }
  },
}));

// Non-hook accessor for use in WebSocket handlers
export const tradeStore = {
  addTrades: (symbol: string, trades: Trade[]) =>
    useTradeStore.getState().addTrades(symbol, trades),
  getTrades: (symbol: string) => useTradeStore.getState().getTrades(symbol),
  clear: (symbol?: string) => useTradeStore.getState().clear(symbol),
};
