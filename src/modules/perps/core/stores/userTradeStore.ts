import { create } from 'zustand';

import type { UserTrade } from '../models';

interface UserTradeStoreState {
  trades: UserTrade[];
  setTrades: (trades: UserTrade[]) => void;
  addTrade: (trade: UserTrade) => void;
}

export const useUserTradeStore = create<UserTradeStoreState>(set => ({
  trades: [],
  setTrades: trades => set({ trades }),
  addTrade: trade =>
    set(state => ({
      trades: [trade, ...state.trades].slice(0, 500), // Keep last 500
    })),
}));
