import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { TokenInfo } from '../types/ammSwap.types';

interface ChartPair {
  base: string;
  counter: string;
  baseIssuer?: string;
  counterIssuer?: string;
}

interface PreSelectedToken {
  code: string;
  issuer?: string;
}

interface SwapHistory {
  transactions: any[];
  favorites: TokenInfo[];
}

interface AmmSwapStore extends SwapHistory {
  defaultSlippage: number;
  expertMode: boolean;
  selectedChartPair: ChartPair | null;
  preSelectedToken: PreSelectedToken | null;

  addTransaction: (tx: any) => void;
  updateTransaction: (id: string, updates: Partial<any>) => void;
  addFavorite: (token: TokenInfo) => void;
  removeFavorite: (tokenCode: string) => void;
  setDefaultSlippage: (slippage: number) => void;
  setExpertMode: (enabled: boolean) => void;
  setSelectedChartPair: (pair: ChartPair | null) => void;
  setPreSelectedToken: (token: PreSelectedToken | null) => void;
  clearHistory: () => void;
}

export const useAmmSwapStore = create<AmmSwapStore>()(
  persist(
    set => ({
      transactions: [],
      favorites: [],
      defaultSlippage: 1,
      expertMode: false,
      selectedChartPair: {
        base: 'XLM',
        counter: 'USDC',
        baseIssuer: undefined,
        counterIssuer: 'GBBD47R2LWK7P7TV222OISDOK6V2QQQSK37Q7VURB6L74QVN56AGEBI5',
      },
      preSelectedToken: null,

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

      setSelectedChartPair: pair => set({ selectedChartPair: pair }),

      setPreSelectedToken: token => set({ preSelectedToken: token }),

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
