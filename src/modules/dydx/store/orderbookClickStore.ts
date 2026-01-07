import { create } from 'zustand';

interface OrderbookClickStore {
  onPriceClick: ((price: string) => void) | null;
  setOnPriceClick: (handler: ((price: string) => void) | null) => void;
}

export const useOrderbookClickStore = create<OrderbookClickStore>(set => ({
  onPriceClick: null,
  setOnPriceClick: handler => set({ onPriceClick: handler }),
}));
