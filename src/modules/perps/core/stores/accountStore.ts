import { create } from 'zustand';
import type { AccountBalance } from '../models';

interface AccountStoreState {
  balances: Record<string, AccountBalance>;
  multiAssetsMargin: boolean;
  setBalances: (balances: AccountBalance[]) => void;
  setMultiAssetsMargin: (isMultiAsset: boolean) => void;
  updateBalance: (balance: AccountBalance) => void;
  getBalance: (asset: string) => AccountBalance | undefined;
}

export const useAccountStore = create<AccountStoreState>((set, get) => ({
  balances: {},
  multiAssetsMargin: false,
  setBalances: (balances) => {
    const nextBalances: Record<string, AccountBalance> = {};
    balances.forEach((b) => {
      nextBalances[b.asset] = b;
    });
    set({ balances: nextBalances });
  },
  setMultiAssetsMargin: (isMultiAsset) => set({ multiAssetsMargin: isMultiAsset }),
  updateBalance: (balance) =>
    set((state) => ({
      balances: {
        ...state.balances,
        [balance.asset]: balance,
      },
    })),
  getBalance: (asset) => get().balances[asset],
}));
