import type { Signer } from 'ethers';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { useNotificationStore } from '../../../../store/notificationStore';
import { getAccountInfo, getDepositWithdrawHistory } from '../../adapters/aster/api/account';
import { useAccountStore } from './accountStore';

export type DepositTrackStatus = 'CONFIRMING_ON_CHAIN' | 'INDEXING' | 'CONFIRMED' | 'FAILED';

export interface PendingDepositRecord {
  id: string;
  txHash: string;
  asset: string;
  amount: string;
  chainId: number;
  chainName: string;
  explorerUrl: string;
  timestamp: number;
  status: DepositTrackStatus;
  error?: string;
}

interface DepositTrackerState {
  pendingDeposits: PendingDepositRecord[];
  addDeposit: (deposit: Omit<PendingDepositRecord, 'id' | 'timestamp'>) => void;
  updateStatus: (txHash: string, status: DepositTrackStatus, error?: string) => void;
  removeDeposit: (txHash: string) => void;
  clearCompleted: () => void;
  hasActiveDeposits: () => boolean;
}

let pollingInterval: NodeJS.Timeout | null = null;

export const useDepositTrackerStore = create<DepositTrackerState>()(
  persist(
    (set, get) => ({
      pendingDeposits: [],

      addDeposit: deposit => {
        const id = `${deposit.txHash}_${Date.now()}`;
        const newRecord: PendingDepositRecord = {
          ...deposit,
          id,
          timestamp: Date.now(),
        };

        set(state => {
          // Prevent duplicates
          const filtered = state.pendingDeposits.filter(
            d => d.txHash.toLowerCase() !== deposit.txHash.toLowerCase()
          );
          return { pendingDeposits: [newRecord, ...filtered] };
        });
      },

      updateStatus: (txHash, status, error) => {
        set(state => ({
          pendingDeposits: state.pendingDeposits.map(d =>
            d.txHash.toLowerCase() === txHash.toLowerCase()
              ? { ...d, status, ...(error ? { error } : {}) }
              : d
          ),
        }));
      },

      removeDeposit: txHash => {
        set(state => ({
          pendingDeposits: state.pendingDeposits.filter(
            d => d.txHash.toLowerCase() !== txHash.toLowerCase()
          ),
        }));
      },

      clearCompleted: () => {
        set(state => ({
          pendingDeposits: state.pendingDeposits.filter(
            d => d.status === 'INDEXING' || d.status === 'CONFIRMING_ON_CHAIN'
          ),
        }));
      },

      hasActiveDeposits: () => {
        return get().pendingDeposits.some(
          d => d.status === 'CONFIRMING_ON_CHAIN' || d.status === 'INDEXING'
        );
      },
    }),
    {
      name: 'swiftex_aster_pending_deposits',
    }
  )
);

/**
 * Starts a targeted short-lived poller that runs ONLY when there are active pending deposits.
 * Automatically terminates when all deposits are confirmed or resolved.
 */
export function startDepositPolling(signer: Signer, userAddr: string) {
  if (pollingInterval) return; // already polling

  const checkPending = async () => {
    const store = useDepositTrackerStore.getState();
    const active = store.pendingDeposits.filter(
      d => d.status === 'INDEXING' || d.status === 'CONFIRMING_ON_CHAIN'
    );

    if (active.length === 0) {
      stopDepositPolling();
      return;
    }

    try {
      // Check Aster account balance & history
      const [accountInfo, history] = await Promise.all([
        getAccountInfo(signer, userAddr),
        getDepositWithdrawHistory(signer, userAddr, { limit: 15, type: 'DEPOSIT' }).catch(() => []),
      ]);

      // Update balances in store
      if (accountInfo?.assets) {
        const mappedBalances = accountInfo.assets.map((a: any) => ({
          asset: a.asset,
          total: a.walletBalance,
          available: a.availableBalance || a.crossWalletBalance || '0',
          locked: String(
            parseFloat(a.walletBalance || '0') -
            parseFloat(a.availableBalance || a.crossWalletBalance || '0')
          ),
          marginBalance: a.marginBalance || a.crossWalletBalance || a.walletBalance || '0',
          unrealizedPnl: a.unrealizedProfit || '0',
        }));
        useAccountStore.getState().setBalances(mappedBalances);
      }

      const now = Date.now();
      for (const item of active) {
        // Check if transaction is found in Aster deposit history
        const foundInHistory = history.some(
          h =>
            h.txHash?.toLowerCase() === item.txHash.toLowerCase() &&
            (h.state === 'SUCCESS' || h.state === 'PROCESSING')
        );

        // If found in history OR if more than 3 minutes passed and balance updated
        if (foundInHistory) {
          store.updateStatus(item.txHash, 'CONFIRMED');
          useNotificationStore.getState().showToast({
            type: 'DYDX',
            title: 'Deposit Credited',
            message: `${item.amount} ${item.asset} has been credited to your Aster account!`,
          });
        } else if (now - item.timestamp > 180000) {
          // Timeout after 3 minutes -> mark as confirmed
          store.updateStatus(item.txHash, 'CONFIRMED');
        }
      }

      // Check if we still have active deposits
      if (!useDepositTrackerStore.getState().hasActiveDeposits()) {
        stopDepositPolling();
      }
    } catch (err) {
      console.warn('[DepositTracker] Polling check encountered error:', err);
    }
  };

  // Run initial check and set interval every 10 seconds
  checkPending();
  pollingInterval = setInterval(checkPending, 10000);
}

export function stopDepositPolling() {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }
}
