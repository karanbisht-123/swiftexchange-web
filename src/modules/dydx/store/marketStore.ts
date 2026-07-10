import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { MarketData } from '../types/trading.types';

interface MarketState {
  selectedMarket: string;
  selectedMarketData: MarketData | null;
  marketCache: Record<string, MarketData>;
  lastUpdate: number;
  setSelectedMarket: (ticker: string, marketData?: MarketData) => void;
  updateMarketData: (marketData: MarketData) => void;
  updateMarketCache: (markets: Record<string, MarketData>) => void;
  clearCache: () => void;
}

const DEFAULT_MARKET = 'BTC-USD';

const useMarketStore = create<MarketState>()(
  persist(
    (set, get) => ({
      selectedMarket: DEFAULT_MARKET,
      selectedMarketData: null,
      marketCache: {},
      lastUpdate: 0,

      setSelectedMarket: (ticker: string, marketData?: MarketData) => {
        set({
          selectedMarket: ticker,
          selectedMarketData: marketData || get().marketCache[ticker] || null,
        });
      },

      updateMarketData: (marketData: MarketData) => {
        const state = get();

        const updatedCache = {
          ...state.marketCache,
          [marketData.ticker]: marketData,
        };
        const updates: Partial<MarketState> = {
          marketCache: updatedCache,
          lastUpdate: Date.now(),
        };

        if (state.selectedMarket === marketData.ticker) {
          updates.selectedMarketData = marketData;
        }

        set(updates);
      },

      updateMarketCache: (markets: Record<string, MarketData>) => {
        const state = get();
        const updatedCache = { ...state.marketCache, ...markets };

        const updates: Partial<MarketState> = {
          marketCache: updatedCache,
          lastUpdate: Date.now(),
        };

        if (state.selectedMarket && markets[state.selectedMarket]) {
          updates.selectedMarketData = markets[state.selectedMarket];
        }

        set(updates);
      },

      clearCache: () => {
        set({
          marketCache: {},
          lastUpdate: 0,
        });
      },
    }),
    {
      name: 'market-store',
      partialize: state => ({
        selectedMarket: state.selectedMarket,
      }),
    }
  )
);

export default useMarketStore;
