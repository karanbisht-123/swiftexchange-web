import { create } from 'zustand';

import type { MarketData } from '../hooks/useMarkets';

interface MarketState {
  selectedMarket: string;
  selectedMarketData: MarketData | null;
  setSelectedMarket: (ticker: string, marketData?: MarketData) => void;
  updateMarketData: (marketData: MarketData) => void;
}

const getSavedMarket = (): string => {
  return 'BTC-USD';
};

const useMarketStore = create<MarketState>(set => ({
  selectedMarket: getSavedMarket(),
  selectedMarketData: null,

  setSelectedMarket: (ticker: string, marketData?: MarketData) => {
    set({
      selectedMarket: ticker,
      selectedMarketData: marketData || null,
    });
  },

  updateMarketData: (marketData: MarketData) => {
    set(state => {
      if (state.selectedMarket === marketData.ticker) {
        return { selectedMarketData: marketData };
      }
      return state;
    });
  },
}));

export default useMarketStore;
