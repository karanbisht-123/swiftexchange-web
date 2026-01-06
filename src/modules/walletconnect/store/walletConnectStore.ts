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
import { walletService } from '../services/walletService';

export type WalletType = 'evm' | 'cosmos' | 'stellar';
type ConnectionState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'signing'
  | 'deriving'
  | 'failed'
  | 'disconnected';

export interface ConnectedWallet {
  type: WalletType;
  walletId: string;
  address: string;
  chainId?: string | number;
  dydxAddress?: string;
  dydxMnemonic?: string;
}

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
  deriveDydx: () => Promise<void>;
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
    return localStorage.getItem('network') === 'testnet' ? 'testnet' : 'mainnet';
  } catch {
    return 'mainnet';
  }
};
const initialNetwork = getInitialNetwork();

export const useWalletStore = create<WalletState & WalletActions>((set, get) => ({
  connectedWallets: {},
  connectionStatus: {},
  isModalOpen: false,
  network: initialNetwork,
  availableEVMChains: getEVMChains(initialNetwork),
  availableCosmosChains: getCosmosChains(initialNetwork),
  currentStellarConfig: getStellarConfig(initialNetwork),
  isRestoringSession: false,

  connectWallet: async (type, walletId) => {
    if (get().connectedWallets[type]) return;

    set(state => ({
      connectionStatus: {
        ...state.connectionStatus,
        [type]: { state: 'connecting' },
      },
    }));

    try {
      const session =
        type === 'stellar'
          ? await walletService.connectStellar(walletId)
          : await walletService.connectChainWallet(walletId, type, true);

      const wallet: ConnectedWallet = {
        type,
        walletId,
        address:
          type === 'evm'
            ? session.evmAddress!
            : type === 'cosmos'
              ? session.cosmosAddress!
              : session.stellarAddress!,
        chainId:
          type === 'evm'
            ? session.evmChainId
            : type === 'cosmos'
              ? session.cosmosChainId
              : session.stellarChainId,
        dydxAddress: session.dydxAddress,
        dydxMnemonic: session.dydxMnemonic,
      };

      set(state => ({
        connectedWallets: { ...state.connectedWallets, [type]: wallet },
        connectionStatus: {
          ...state.connectionStatus,
          [type]: { state: 'connected' },
        },
        isModalOpen: false,
      }));

      // FIX: Show notification if derivation was skipped
      if ('derivationSkipped' in session && session.derivationSkipped && type === 'evm') {
        console.log('[WalletStore] dYdX derivation was skipped - user can derive manually');
        // You could emit an event here or show a toast notification
      }
    } catch (error) {
      set(state => ({
        connectionStatus: {
          ...state.connectionStatus,
          [type]: {
            state: 'failed',
            error: error instanceof Error ? error.message : 'Connection failed',
          },
        },
      }));
      throw error;
    }
  },

  deriveDydx: async () => {
    const evm = get().connectedWallets.evm;
    if (!evm || evm.dydxAddress) return;

    set(state => ({
      connectionStatus: {
        ...state.connectionStatus,
        evm: { state: 'signing' },
      },
    }));

    try {
      const dydx = await walletService.deriveDydx();

      set(state => ({
        connectedWallets: {
          ...state.connectedWallets,
          evm: {
            ...state.connectedWallets.evm!,
            dydxAddress: dydx.address,
            dydxMnemonic: dydx.mnemonic,
          },
        },
        connectionStatus: {
          ...state.connectionStatus,
          evm: { state: 'connected' },
        },
      }));
    } catch (error) {
      set(state => ({
        connectionStatus: {
          ...state.connectionStatus,
          evm: { state: 'connected' },
        },
      }));
      throw error;
    }
  },

  disconnect: async type => {
    await walletService.disconnect(type);
    set(state => {
      const wallets = { ...state.connectedWallets };
      const status = { ...state.connectionStatus };
      delete wallets[type];
      delete status[type];
      return { connectedWallets: wallets, connectionStatus: status };
    });
  },

  restoreSessions: async () => {
    if (get().isRestoringSession) return;
    set({ isRestoringSession: true });

    try {
      const sessions = await walletService.restoreSessions();
      if (!sessions.length) {
        set({ isRestoringSession: false });
        return;
      }

      const wallets: Partial<Record<WalletType, ConnectedWallet>> = {};
      const status: Partial<Record<WalletType, WalletConnectionStatus>> = {};

      sessions.forEach(s => {
        wallets[s.type] = {
          type: s.type,
          walletId: s.walletId,
          address:
            s.type === 'evm'
              ? s.evmAddress!
              : s.type === 'cosmos'
                ? s.cosmosAddress!
                : s.stellarAddress!,
          chainId:
            s.type === 'evm'
              ? s.evmChainId
              : s.type === 'cosmos'
                ? s.cosmosChainId
                : s.stellarChainId,
          dydxAddress: s.dydxAddress,
        };
        status[s.type] = { state: 'connected' };
      });

      set({
        connectedWallets: wallets,
        connectionStatus: status,
        isRestoringSession: false,
      });
    } catch (error) {
      console.error('[WalletStore] Restore sessions failed:', error);
      set({ isRestoringSession: false });
    }
  },

  setNetwork: async network => {
    if (network === get().network) return;
    await walletService.setNetwork(network);
    set({
      network,
      connectedWallets: {},
      connectionStatus: {},
      availableEVMChains: getEVMChains(network),
      availableCosmosChains: getCosmosChains(network),
      currentStellarConfig: getStellarConfig(network),
    });
  },

  openModal: () => set({ isModalOpen: true }),
  closeModal: () => set({ isModalOpen: false }),

  isConnected: type => !!get().connectedWallets[type],
  isConnecting: type =>
    ['connecting', 'signing', 'deriving'].includes(get().connectionStatus[type]?.state || ''),
}));

// FIXED: Better listener implementation with proper state comparison
let listenerRegistered = false;

if (!listenerRegistered) {
  listenerRegistered = true;

  walletService.onStateChange((type, state) => {
    console.log('[WalletStore] State change event:', { type, state });

    // Use getState() to avoid closure issues
    const currentState = useWalletStore.getState();
    const currentStatus = currentState.connectionStatus[type];

    // CRITICAL FIX: Prevent infinite loops by checking if state actually changed
    if (currentStatus?.state === state) {
      console.log('[WalletStore] State unchanged, skipping update');
      return;
    }

    // Handle disconnection and failures
    if (state === 'disconnected' || state === 'failed') {
      useWalletStore.setState(prev => {
        const { [type]: _, ...remainingWallets } = prev.connectedWallets;
        const { [type]: __, ...remainingStatus } = prev.connectionStatus;
        return {
          connectedWallets: remainingWallets,
          connectionStatus: remainingStatus,
        };
      });
      return;
    }

    // Only update status for intermediate states (connecting, signing, deriving)
    // Don't update for 'connected' state as it's handled by connectWallet action
    if (state === 'connecting' || state === 'signing' || state === 'deriving') {
      useWalletStore.setState(prev => ({
        connectionStatus: {
          ...prev.connectionStatus,
          [type]: { state },
        },
      }));
    }
  });
}

export const selectConnectedWallet = (type: WalletType) => (state: WalletState) =>
  state.connectedWallets[type];

export const selectConnectionStatus = (type: WalletType) => (state: WalletState) =>
  state.connectionStatus[type];

export const selectIsAnyWalletConnected = (state: WalletState) =>
  Object.keys(state.connectedWallets).length > 0;

export const selectDydxWallet = (state: WalletState) => {
  const evm = state.connectedWallets.evm;
  const cosmos = state.connectedWallets.cosmos;

  if (evm?.dydxAddress) {
    return {
      address: evm.dydxAddress,
      mnemonic: evm.dydxMnemonic || null,
      ethAddress: evm.address,
    };
  }

  if (cosmos?.dydxAddress) {
    return {
      address: cosmos.dydxAddress,
      mnemonic: cosmos.dydxMnemonic || null,
      cosmosAddress: cosmos.address,
    };
  }

  return null;
};

export const selectHasDydxWallet = (state: WalletState) => {
  const evm = state.connectedWallets.evm;
  const cosmos = state.connectedWallets.cosmos;
  return Boolean(evm?.dydxAddress || cosmos?.dydxAddress);
};
