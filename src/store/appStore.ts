import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { useWalletStore } from '../modules/wallet/store.ts/walletStore';
import { SecurityUtils } from '../utils/SecurityUtils';

interface AppState {
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  recipientAddress: string;
  setRecipientAddress: (address: string) => void;
  amount: string;
  setAmount: (amount: string) => void;
  memo: string;
  setMemo: (memo: string) => void;
  selectedAssetValue: string;
  setSelectedAssetValue: (asset: string) => void;
  resetTransactionForm: () => void;
  securityInfo: {
    isSecure: boolean;
    webCryptoAvailable: boolean;
    warnings: string[];
  };
}

export const useAppStore = create<AppState>()(
  persist(
    (set, _) => ({
      theme: 'light',
      toggleTheme: () => set(state => ({ theme: state.theme === 'light' ? 'dark' : 'light' })),
      recipientAddress: '',
      setRecipientAddress: (address: string) => set({ recipientAddress: address }),
      amount: '',
      setAmount: (amount: string) => set({ amount }),
      memo: '',
      setMemo: (memo: string) => set({ memo }),
      selectedAssetValue: 'XLM',
      setSelectedAssetValue: (asset: string) => set({ selectedAssetValue: asset }),
      resetTransactionForm: () =>
        set({
          recipientAddress: '',
          amount: '',
          memo: '',
          selectedAssetValue: 'XLM',
        }),
      securityInfo: {
        isSecure: true,
        webCryptoAvailable: typeof window !== 'undefined' && !!window.crypto?.subtle,
        warnings: [],
      },
    }),
    {
      name: 'swiftex-app-storage',
      version: 1,
      partialize: state => ({
        theme: state.theme,
        selectedAssetValue: state.selectedAssetValue,
      }),
      migrate: (persistedState, version) => {
        if (version < 1) {
          return {
            theme: (persistedState as any)?.theme || 'light',
            selectedAssetValue: 'XLM',
          };
        }
        return persistedState;
      },
    }
  )
);

if (typeof window !== 'undefined') {
  const walletStore = useWalletStore;
  const state = walletStore.getState();
  if (state.isConnected && state.session && !state.session.isValid()) {
    console.info('Found expired session on app load, cleaning up');
    state.disconnectWallet();
  }

  let activityTimeout: NodeJS.Timeout;
  const handleActivity = () => {
    const currentState = walletStore.getState();
    if (currentState.isConnected && currentState.isSessionValid()) {
      clearTimeout(activityTimeout);
      activityTimeout = setTimeout(() => {
        currentState.refreshSession();
      }, 30000);
    }
  };

  const activityEvents = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
  activityEvents.forEach(event => {
    document.addEventListener(event, handleActivity, { passive: true });
  });

  window.addEventListener('beforeunload', () => {
    const state = walletStore.getState();
    if (state.isConnected) {
      state.disconnectWallet();
    }
    SecurityUtils.clearAllSensitiveData();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      const state = walletStore.getState();
      if (state.isConnected) {
        console.info('Session expired while page was hidden');
        state.disconnectWallet();
      }
    }
  });
}
