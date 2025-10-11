import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { type DydxNetwork } from '../types/wallet.types';

export type ConnectionStep =
  | 'idle'
  | 'signing'
  | 'deriving'
  | 'initializing'
  | 'fetching'
  | 'connected';

interface DydxStore {
  // State
  isConnected: boolean;
  address: string | null;
  publicKey: string | null;
  mnemonic: string | null;
  network: DydxNetwork;
  positions: any[];
  balances: any[];
  markets: any[];
  isLoading: boolean;
  error: string | null;
  connectionStep: ConnectionStep;

  // Actions
  setAddress: (address: string, publicKey: string) => void;
  setMnemonic: (mnemonic: string) => void;
  setConnected: (connected: boolean) => void;
  setNetwork: (network: DydxNetwork) => void;
  setPositions: (positions: any[]) => void;
  setBalances: (balances: any[]) => void;
  setMarkets: (markets: any[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setConnectionStep: (step: ConnectionStep) => void;
  reset: () => void;
}

const initialState = {
  isConnected: false,
  address: null,
  publicKey: null,
  mnemonic: null,
  network: 'testnet' as DydxNetwork,
  positions: [],
  balances: [],
  markets: [],
  isLoading: false,
  error: null,
  connectionStep: 'idle' as ConnectionStep,
};

/**
 * Zustand store for dYdX state management
 * Persists mnemonic and network selection to localStorage
 */
export const useDydxStore = create<DydxStore>()(
  persist(
    set => ({
      ...initialState,

      setAddress: (address, publicKey) => set({ address, publicKey }),

      setMnemonic: mnemonic => set({ mnemonic }),

      setConnected: connected => set({ isConnected: connected }),

      setNetwork: network => set({ network }),

      setPositions: positions => set({ positions }),

      setBalances: balances => set({ balances }),

      setMarkets: markets => set({ markets }),

      setLoading: loading => set({ isLoading: loading }),

      setError: error => set({ error }),

      setConnectionStep: step => set({ connectionStep: step }),

      reset: () => set(initialState),
    }),
    {
      name: 'dydx-wallet-storage',
      partialize: state => ({
        // Only persist these fields
        mnemonic: state.mnemonic,
        network: state.network,
      }),
    }
  )
);
