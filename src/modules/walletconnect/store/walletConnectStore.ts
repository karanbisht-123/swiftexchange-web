import { create } from 'zustand';

import {
  type CosmosChainConfig,
  type EVMChainConfig,
  type NetworkType,
  type StellarChainConfig,
  getCosmosChains,
  getEVMChains,
  getStellarConfig,
} from '../config/chains';
import { WalletType } from '../constants/Wallet';
import { walletService } from '../services/walletService';

// Types
export interface ConnectedWallet {
  walletId: string;
  address: string;
  chainId: string | number;
}

type ConnectionState = 'idle' | 'connecting' | 'connected' | 'error';

interface WalletConnectionStatus {
  state: ConnectionState;
  error?: string;
}

export interface WalletState {
  // Connection data
  connectedWallets: Partial<Record<WalletType, ConnectedWallet>>;
  connectionStatus: Partial<Record<WalletType, WalletConnectionStatus>>;

  // UI state
  isModalOpen: boolean;

  // Network & chains
  network: NetworkType;
  availableEVMChains: EVMChainConfig[];
  availableCosmosChains: CosmosChainConfig[];
  currentStellarConfig: StellarChainConfig;
}

interface WalletActions {
  // Connection management
  connectWallet: (type: WalletType, walletId: string) => Promise<void>;
  disconnect: (type: WalletType) => Promise<void>;
  restoreSessions: () => Promise<void>;

  // UI
  openModal: () => void;
  closeModal: () => void;

  // Network
  setNetwork: (network: NetworkType) => Promise<void>;

  // Status checks
  isConnected: (type: WalletType) => boolean;
  isConnecting: (type: WalletType) => boolean;
}

// Helper to get initial network
const getInitialNetwork = (): NetworkType => {
  try {
    const stored = localStorage.getItem('current_network');
    return stored === 'testnet' ? 'testnet' : 'mainnet';
  } catch {
    return 'mainnet';
  }
};

// Create store
export const useWalletStore = create<WalletState & WalletActions>((set, get) => {
  const initialNetwork = getInitialNetwork();

  // Listen to service connection state changes
  walletService.onConnectionStateChange((type, state) => {
    if (state === 'connecting') {
      set(prev => ({
        connectionStatus: {
          ...prev.connectionStatus,
          [type]: { state: 'connecting' },
        },
      }));
    } else if (state === 'connected') {
      set(prev => ({
        connectionStatus: {
          ...prev.connectionStatus,
          [type]: { state: 'connected' },
        },
      }));
    } else if (state === 'failed') {
      set(prev => ({
        connectionStatus: {
          ...prev.connectionStatus,
          [type]: { state: 'error', error: 'Connection failed' },
        },
      }));
    } else if (state === 'cancelled') {
      set(prev => ({
        connectionStatus: {
          ...prev.connectionStatus,
          [type]: { state: 'idle' },
        },
      }));
    }
  });

  return {
    // ==================== INITIAL STATE ====================
    connectedWallets: {},
    connectionStatus: {},
    isModalOpen: false,
    network: initialNetwork,
    availableEVMChains: getEVMChains(initialNetwork),
    availableCosmosChains: getCosmosChains(initialNetwork),
    currentStellarConfig: getStellarConfig(initialNetwork),

    // ==================== ACTIONS ====================

    connectWallet: async (type, walletId) => {
      // Set connecting state
      set(prev => ({
        connectionStatus: {
          ...prev.connectionStatus,
          [type]: { state: 'connecting' },
        },
      }));

      try {
        let result;

        // Call appropriate service method
        if (type === WalletType.EVM) {
          result = await walletService.connectEVM(walletId);
        } else if (type === WalletType.COSMOS) {
          result = await walletService.connectCosmos(walletId);
        } else if (type === WalletType.STELLAR) {
          result = await walletService.connectStellar(walletId);
        } else {
          throw new Error('Invalid wallet type');
        }

        // Update store with successful connection
        set(prev => ({
          connectedWallets: {
            ...prev.connectedWallets,
            [type]: {
              walletId: result.walletId,
              address: result.address,
              chainId: (result as any).chainId || '',
            },
          },
          connectionStatus: {
            ...prev.connectionStatus,
            [type]: { state: 'connected' },
          },
          isModalOpen: false,
        }));
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Connection failed';

        set(prev => ({
          connectionStatus: {
            ...prev.connectionStatus,
            [type]: { state: 'error', error: errorMessage },
          },
        }));

        throw error;
      }
    },

    disconnect: async type => {
      try {
        await walletService.disconnect(type);

        // Remove from store
        set(prev => {
          const newWallets = { ...prev.connectedWallets };
          const newStatus = { ...prev.connectionStatus };
          delete newWallets[type];
          delete newStatus[type];

          return {
            connectedWallets: newWallets,
            connectionStatus: newStatus,
          };
        });
      } catch (error) {
        console.error(`Failed to disconnect ${type}:`, error);

        // Still remove from store even if service fails
        set(prev => {
          const newWallets = { ...prev.connectedWallets };
          const newStatus = { ...prev.connectionStatus };
          delete newWallets[type];
          delete newStatus[type];

          return {
            connectedWallets: newWallets,
            connectionStatus: newStatus,
          };
        });

        throw error;
      }
    },

    restoreSessions: async () => {
      try {
        const connections = await walletService.restoreSessions();

        if (connections.length === 0) return;

        set(prev => {
          const newWallets = { ...prev.connectedWallets };
          const newStatus = { ...prev.connectionStatus };

          connections.forEach(({ type, address, chainId, walletId }) => {
            newWallets[type] = { walletId, address, chainId };
            newStatus[type] = { state: 'connected' };
          });

          return {
            connectedWallets: newWallets,
            connectionStatus: newStatus,
          };
        });
      } catch (error) {
        console.error('Failed to restore sessions:', error);
      }
    },

    setNetwork: async network => {
      const currentNetwork = get().network;
      if (currentNetwork === network) return;

      try {
        await walletService.setNetwork(network);
        set({
          network,
          connectedWallets: {},
          connectionStatus: {},
          availableEVMChains: getEVMChains(network),
          availableCosmosChains: getCosmosChains(network),
          currentStellarConfig: getStellarConfig(network),
        });
      } catch (error) {
        console.error('Failed to switch network:', error);
        throw error;
      }
    },

    openModal: () => set({ isModalOpen: true }),

    closeModal: () => set({ isModalOpen: false }),

    isConnected: type => {
      const wallets = get().connectedWallets;
      return !!wallets[type];
    },

    isConnecting: type => {
      const status = get().connectionStatus[type];
      return status?.state === 'connecting';
    },
  };
});

//  useful selectors for components
export const selectConnectedWallet = (type: WalletType) => (state: WalletState) =>
  state.connectedWallets[type];

export const selectConnectionStatus = (type: WalletType) => (state: WalletState) =>
  state.connectionStatus[type];

export const selectIsAnyWalletConnected = (state: WalletState) =>
  Object.keys(state.connectedWallets).length > 0;

export const selectConnectedWalletTypes = (state: WalletState) =>
  Object.keys(state.connectedWallets) as WalletType[];

export const selectChainConfig = (type: WalletType) => (state: WalletState) => {
  if (type === WalletType.EVM) return state.availableEVMChains;
  if (type === WalletType.COSMOS) return state.availableCosmosChains;
  return state.currentStellarConfig;
};
