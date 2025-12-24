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
  connectedWallets: Partial<Record<WalletType, ConnectedWallet>>;
  connectionStatus: Partial<Record<WalletType, WalletConnectionStatus>>;
  isModalOpen: boolean;
  network: NetworkType;
  availableEVMChains: EVMChainConfig[];
  availableCosmosChains: CosmosChainConfig[];
  currentStellarConfig: StellarChainConfig;
  isRestoringSession: boolean;
}

interface WalletActions {
  connectWallet: (type: WalletType, walletId: string) => Promise<void>;
  disconnect: (type: WalletType) => Promise<void>;
  restoreSessions: () => Promise<void>;
  openModal: () => void;
  closeModal: () => void;
  setNetwork: (network: NetworkType) => Promise<void>;
  isConnected: (type: WalletType) => boolean;
  isConnecting: (type: WalletType) => boolean;
}

const getInitialNetwork = (): NetworkType => {
  try {
    const stored = localStorage.getItem('current_network');
    return stored === 'testnet' ? 'testnet' : 'mainnet';
  } catch {
    return 'mainnet';
  }
};

export const useWalletStore = create<WalletState & WalletActions>((set, get) => {
  const initialNetwork = getInitialNetwork();

  // Listen to wallet service connection state changes
  walletService.onConnectionStateChange((type, state) => {
    const currentState = get().connectionStatus[type]?.state;

    console.log('[WalletStore] Connection state changed:', type, state, 'current:', currentState);

    let newStatus: WalletConnectionStatus;
    let shouldRemoveWallet = false;

    switch (state) {
      case 'connecting':
        newStatus = { state: 'connecting' };
        break;
      case 'connected':
        newStatus = { state: 'connected' };
        break;
      case 'failed':
        newStatus = { state: 'error', error: 'Connection failed' };
        shouldRemoveWallet = true;
        break;
      case 'cancelled':
        newStatus = { state: 'idle' };
        shouldRemoveWallet = true;
        break;
      case 'disconnected':
        newStatus = { state: 'idle' };
        shouldRemoveWallet = true;
        break;
      default:
        return;
    }

    set(prev => {
      const updates: Partial<WalletState> = {
        connectionStatus: {
          ...prev.connectionStatus,
          [type]: newStatus,
        },
      };

      // Remove wallet from connected wallets if disconnected
      if (shouldRemoveWallet && prev.connectedWallets[type]) {
        console.log('[WalletStore] Removing wallet from state:', type);
        const newWallets = { ...prev.connectedWallets };
        delete newWallets[type];
        updates.connectedWallets = newWallets;
      }

      return updates;
    });
  });

  return {
    connectedWallets: {},
    connectionStatus: {},
    isModalOpen: false,
    network: initialNetwork,
    availableEVMChains: getEVMChains(initialNetwork),
    availableCosmosChains: getCosmosChains(initialNetwork),
    currentStellarConfig: getStellarConfig(initialNetwork),
    isRestoringSession: false,

    connectWallet: async (type, walletId) => {
      console.log('[WalletStore] Connect wallet:', type, walletId);

      if (!type || !Object.values(WalletType).includes(type)) {
        console.error('[WalletStore] Invalid wallet type:', type);
        throw new Error(`Invalid wallet type: ${type}`);
      }

      const currentWallets = get().connectedWallets;
      if (currentWallets[type]) {
        console.warn('[WalletStore] Wallet already connected:', type);
        return;
      }

      set(prev => ({
        connectionStatus: {
          ...prev.connectionStatus,
          [type]: { state: 'connecting' },
        },
      }));

      try {
        let result;

        if (type === WalletType.EVM) {
          result = await walletService.connectEVM(walletId);
        } else if (type === WalletType.COSMOS) {
          result = await walletService.connectCosmos(walletId);
        } else if (type === WalletType.STELLAR) {
          result = await walletService.connectStellar(walletId);
        } else {
          throw new Error('Invalid wallet type');
        }

        if (!result || !result.address) {
          throw new Error('Invalid connection result: missing address');
        }

        console.log('[WalletStore] Connection successful:', type, result);

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
        console.error('[WalletStore] Connection failed:', type, errorMessage);

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
      console.log('[WalletStore] Disconnect:', type);

      try {
        await walletService.disconnect(type);

        // The wallet will be removed from state via the connectionStateChange listener
        console.log('[WalletStore] Disconnect complete:', type);
      } catch (error) {
        console.error('[WalletStore] Disconnect error:', type, error);

        // Force clean up state even on error
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
      const state = get();
      if (state.isRestoringSession) {
        console.log('[WalletStore] Session restoration already in progress');
        return;
      }

      console.log('[WalletStore] Starting session restoration');
      set({ isRestoringSession: true });

      try {
        const connections = await walletService.restoreSessions();

        console.log('[WalletStore] Restored connections:', connections);

        if (connections.length === 0) {
          console.log('[WalletStore] No sessions to restore');
          set({ isRestoringSession: false });
          return;
        }

        // Build new state with all restored wallets
        const newWallets: Partial<Record<WalletType, ConnectedWallet>> = {};
        const newStatus: Partial<Record<WalletType, WalletConnectionStatus>> = {};

        // Track addresses to prevent duplicates
        const seenAddresses = new Set<string>();

        connections.forEach(conn => {
          const { type, address, chainId, walletId } = conn;

          if (!type || !Object.values(WalletType).includes(type)) {
            console.warn('[WalletStore] Invalid wallet type during restoration:', conn);
            return;
          }

          // Check for duplicate addresses
          if (seenAddresses.has(address)) {
            console.warn('[WalletStore] Duplicate address detected, skipping:', {
              type,
              address,
            });
            return;
          }

          seenAddresses.add(address);

          console.log('[WalletStore] Restoring session:', type, { address, chainId, walletId });

          newWallets[type] = { walletId, address, chainId };
          newStatus[type] = { state: 'connected' };
        });

        set({
          connectedWallets: newWallets,
          connectionStatus: newStatus,
          isRestoringSession: false,
        });

        console.log(
          '[WalletStore] Session restoration complete. Restored:',
          Object.keys(newWallets).length,
          'wallets'
        );
      } catch (error) {
        console.error('[WalletStore] Session restoration failed:', error);
        set({ isRestoringSession: false });
      }
    },

    setNetwork: async network => {
      const currentNetwork = get().network;
      if (currentNetwork === network) return;

      console.log('[WalletStore] Switching network:', currentNetwork, '->', network);

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

        console.log('[WalletStore] Network switched successfully');
      } catch (error) {
        console.error('[WalletStore] Network switch failed:', error);
        throw error;
      }
    },

    openModal: () => {
      console.log('[WalletStore] Opening modal');
      set({ isModalOpen: true });
    },

    closeModal: () => {
      console.log('[WalletStore] Closing modal');
      set({ isModalOpen: false });
    },

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

// ==================== OPTIMIZED SELECTORS ====================

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

export const selectAllConnectionStates = (state: WalletState) => ({
  evm: state.connectionStatus[WalletType.EVM],
  cosmos: state.connectionStatus[WalletType.COSMOS],
  stellar: state.connectionStatus[WalletType.STELLAR],
});
