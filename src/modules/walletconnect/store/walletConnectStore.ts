import { create } from 'zustand';

import { WalletType } from '../constants/Wallet';
import { walletService } from '../services/walletService';

export interface ConnectedWallet {
  walletId: string;
  address: string;
  chainId: string | number;
}

export interface WalletState {
  connectedWallets: Partial<Record<WalletType, ConnectedWallet>>;
  isModalOpen: boolean;
}

interface WalletActions {
  setConnected: (
    type: WalletType,
    walletId: string,
    address: string,
    chainId: string | number
  ) => void;
  disconnectType: (type: WalletType) => Promise<void>;
  openModal: () => void;
  closeModal: () => void;
}

export const useWalletStore = create<WalletState & WalletActions>(set => ({
  connectedWallets: {},
  isModalOpen: false,

  setConnected: (type, walletId, address, chainId) =>
    set(state => ({
      connectedWallets: {
        ...state.connectedWallets,
        [type]: { walletId, address, chainId },
      },
      isModalOpen: false,
    })),

  disconnectType: async type => {
    try {
      await walletService.disconnect(type);
      set(state => {
        const newConnectedWallets = { ...state.connectedWallets };
        delete newConnectedWallets[type];
        return { connectedWallets: newConnectedWallets };
      });
    } catch (error) {
      console.error('Error disconnecting wallet:', error);
      // Still remove from state even if disconnect fails
      set(state => {
        const newConnectedWallets = { ...state.connectedWallets };
        delete newConnectedWallets[type];
        return { connectedWallets: newConnectedWallets };
      });
    }
  },

  openModal: () => set({ isModalOpen: true }),
  closeModal: () => set({ isModalOpen: false }),
}));
