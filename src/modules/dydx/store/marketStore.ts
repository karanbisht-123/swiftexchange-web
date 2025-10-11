import { create } from 'zustand';

import type { MarketData } from '../hooks/useMarkets';

interface MarketState {
  selectedMarket: string; // Ticker of the selected market
  selectedMarketData: MarketData | null; // Full market data for the selected market
  setSelectedMarket: (ticker: string, marketData?: MarketData) => void;
  updateMarketData: (marketData: MarketData) => void; // Update only market data
}

// Get saved market from memory (you can also use a custom storage solution)
const getSavedMarket = (): string => {
  // For now, using in-memory storage
  // You can implement your own storage solution here
  return 'BTC-USD'; // Default fallback
};

const useMarketStore = create<MarketState>(set => ({
  selectedMarket: getSavedMarket(), // Load saved or default market
  selectedMarketData: null, // Will be populated when market data loads

  setSelectedMarket: (ticker: string, marketData?: MarketData) => {
    // Optional: Save to your custom storage here
    // saveMarketToStorage(ticker);

    set({
      selectedMarket: ticker,
      selectedMarketData: marketData || null,
    });
  },

  updateMarketData: (marketData: MarketData) => {
    set(state => {
      // Only update if this is the currently selected market
      if (state.selectedMarket === marketData.ticker) {
        return { selectedMarketData: marketData };
      }
      return state;
    });
  },
}));

export default useMarketStore;
