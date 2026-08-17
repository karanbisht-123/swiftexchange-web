import { create } from 'zustand';
import type { Market } from '../models';

interface MarketStoreState {
  markets: Record<string, Market>;
  selectedSymbol: string;
  setMarkets: (markets: Market[]) => void;
  setSelectedSymbol: (symbol: string) => void;
}

export const useMarketStore = create<MarketStoreState>((set, get) => ({
  markets: {},
  selectedSymbol: 'BTC-USDT',

  setMarkets: (markets) => {
    const map: Record<string, Market> = {};
    for (const m of markets) map[m.symbol] = m;
    set({ markets: map });
  },

  // Guard: skip if symbol unchanged to avoid triggering downstream subscribers
  setSelectedSymbol: (symbol) => {
    if (get().selectedSymbol === symbol) return;
    set({ selectedSymbol: symbol });
  },
}));

// Non-hook accessor for use outside React (WS handlers, useDynamicExchange init)
export const marketStore = {
  setMarkets: (markets: Market[]) =>
    useMarketStore.getState().setMarkets(markets),
  setSelectedSymbol: (symbol: string) =>
    useMarketStore.getState().setSelectedSymbol(symbol),
  getSelectedSymbol: () => useMarketStore.getState().selectedSymbol,
  getMarket: (symbol: string) => useMarketStore.getState().markets[symbol],
  getAllMarkets: () => Object.values(useMarketStore.getState().markets),
  isHydrated: () => Object.keys(useMarketStore.getState().markets).length > 0,
  subscribe: useMarketStore.subscribe,
};
