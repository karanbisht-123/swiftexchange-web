import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { TokenInfo } from '../types/ammSwap.types';

// AmmSwapTransaction
interface SwapHistory {
  transactions: any[];
  favorites: TokenInfo[];
}

interface AmmSwapStore extends SwapHistory {
  defaultSlippage: number;
  expertMode: boolean;

  addTransaction: (tx: any) => void;
  updateTransaction: (id: string, updates: Partial<any>) => void;
  addFavorite: (token: TokenInfo) => void;
  removeFavorite: (tokenCode: string) => void;
  setDefaultSlippage: (slippage: number) => void;
  setExpertMode: (enabled: boolean) => void;
  clearHistory: () => void;
}

export const useAmmSwapStore = create<AmmSwapStore>()(
  persist(
    set => ({
      transactions: [],
      favorites: [],
      defaultSlippage: 1,
      expertMode: false,

      addTransaction: tx =>
        set(state => ({
          transactions: [tx, ...state.transactions].slice(0, 50),
        })),

      updateTransaction: (id, updates) =>
        set(state => ({
          transactions: state.transactions.map(tx => (tx.id === id ? { ...tx, ...updates } : tx)),
        })),

      addFavorite: token =>
        set(state => {
          const exists = state.favorites.some(t => t.code === token.code);
          if (exists) return state;
          return {
            favorites: [...state.favorites, token],
          };
        }),

      removeFavorite: tokenCode =>
        set(state => ({
          favorites: state.favorites.filter(t => t.code !== tokenCode),
        })),

      setDefaultSlippage: slippage => set({ defaultSlippage: slippage }),

      setExpertMode: enabled => set({ expertMode: enabled }),

      clearHistory: () => set({ transactions: [] }),
    }),
    {
      name: 'amm-swap-storage',
      partialize: state => ({
        favorites: state.favorites,
        defaultSlippage: state.defaultSlippage,
        expertMode: state.expertMode,
        transactions: state.transactions.slice(0, 10),
      }),
    }
  )
);
