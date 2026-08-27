import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ActivationStatus =
  'idle' | 'pending_evm' | 'pending_bridge' | 'activated' | 'completed' | 'failed';

export interface PendingActivation {
  quoteHash: string;
  depositAddress: string;
  originalDestAsset: {
    symbol: string;
    address: string;
  };
  evmTxHash?: string;
  status: ActivationStatus;
  startedAt: number;
  lastIntentStatus?: string;
  pollFailCount?: number;
}

interface ActivationStore {
  pendingActivation: PendingActivation | null;
  isMinimized: boolean;
  setPendingActivation: (activation: PendingActivation | null) => void;
  setMinimized: (min: boolean) => void;
  updateStatus: (status: ActivationStatus, evmTxHash?: string) => void;
  updateIntentStatus: (intentStatus: string, pollFailCount?: number) => void;
  clearActivation: () => void;
}

export const useActivationStore = create<ActivationStore>()(
  persist(
    set => ({
      pendingActivation: null,
      isMinimized: false,
      setPendingActivation: activation =>
        set({ pendingActivation: activation, isMinimized: false }),
      setMinimized: min => set({ isMinimized: min }),
      updateStatus: (status, evmTxHash) =>
        set(state => {
          if (!state.pendingActivation) return state;
          return {
            pendingActivation: {
              ...state.pendingActivation,
              status,
              ...(evmTxHash ? { evmTxHash } : {}),
            },
          };
        }),
      updateIntentStatus: (intentStatus, pollFailCount) =>
        set(state => {
          if (!state.pendingActivation) return state;
          return {
            pendingActivation: {
              ...state.pendingActivation,
              lastIntentStatus: intentStatus,
              ...(pollFailCount !== undefined ? { pollFailCount } : {}),
            },
          };
        }),
      clearActivation: () => set({ pendingActivation: null, isMinimized: false }),
    }),
    {
      name: 'stellar-activation-storage',
    }
  )
);
