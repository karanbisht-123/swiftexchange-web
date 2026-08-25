import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type TxStatus = 'idle' | 'pending' | 'confirmed' | 'rejected' | 'expired';
export type TxType = 'send' | 'swap' | 'bridge';

// Requests older than this are considered stale and auto-discarded (90 seconds)
export const PENDING_REQUEST_TTL_MS = 90_000;

export interface PendingRequest {
  id: number;
  topic: string;
  type: TxType;
  createdAt: number; // epoch ms — used to auto-expire stale requests
}

interface GlobalTxState {
  status: TxStatus;
  pendingRequest: PendingRequest | null;
  setPending: (request: Omit<PendingRequest, 'createdAt'>) => void;
  clearPending: () => void;
  markExpired: () => void;
  /** Returns true if a pending request exists AND is still within the TTL window */
  isLocked: () => boolean;
}

export const useGlobalTxStore = create<GlobalTxState>()(
  persist(
    (set, get) => ({
      status: 'idle',
      pendingRequest: null,

      setPending: request =>
        set({ status: 'pending', pendingRequest: { ...request, createdAt: Date.now() } }),

      clearPending: () => set({ status: 'idle', pendingRequest: null }),

      markExpired: () => set({ status: 'expired', pendingRequest: null }),

      isLocked: () => {
        const { status, pendingRequest } = get();
        if (status !== 'pending' || !pendingRequest) return false;
        // Auto-expire stale requests that were never resolved (e.g. page crash)
        if (Date.now() - pendingRequest.createdAt > PENDING_REQUEST_TTL_MS) {
          get().markExpired();
          return false;
        }
        return true;
      },
    }),
    {
      name: 'global-tx-storage',
      // Only persist the raw data fields; actions are always re-created
      partialize: state => ({
        status: state.status,
        pendingRequest: state.pendingRequest,
      }),
    }
  )
);
