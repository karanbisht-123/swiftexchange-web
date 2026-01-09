import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

import {
  type CosmosChainConfig,
  type EVMChainConfig,
  type NetworkType,
  type StellarChainConfig,
  getCosmosChains,
  getEVMChains,
  getStellarConfig,
} from '../config/chains';

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
  if (typeof window === 'undefined') return 'mainnet';
  console.log('try to catch network ');
  try {
    const stored = localStorage.getItem('network');
    return stored === 'testnet' ? 'testnet' : 'mainnet';
  } catch {
    return 'mainnet';
  }
};

const initialNetwork = getInitialNetwork();

export const useWalletStore = create<WalletState & WalletActions>()(
  subscribeWithSelector((set, get) => ({
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
        console.log('try to catch walletService module ');
        const { walletService } = await import('../services/walletService');

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

        if ('derivationSkipped' in session && session.derivationSkipped && type === 'evm') {
          console.log('[WalletStore] dYdX derivation was skipped - user can derive manually');
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
        const { walletService } = await import('../services/walletService');
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
      const { walletService } = await import('../services/walletService');
      await walletService.disconnect(type);
      set(state => {
        const { [type]: _, ...remainingWallets } = state.connectedWallets;
        const { [type]: __, ...remainingStatus } = state.connectionStatus;
        return {
          connectedWallets: remainingWallets,
          connectionStatus: remainingStatus,
        };
      });
    },

    restoreSessions: async () => {
      if (get().isRestoringSession) return;
      set({ isRestoringSession: true });

      try {
        const { walletService } = await import('../services/walletService');
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
      const { walletService } = await import('../services/walletService');
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
  }))
);

let listenerInitialized = false;

export const initWalletListener = async () => {
  if (listenerInitialized) {
    console.log('[WalletStore] Listener already initialized');
    return;
  }

  try {
    console.log('[WalletStore] Initializing listener...');
    const { walletService } = await import('../services/walletService');

    walletService.onStateChange((type, state) => {
      try {
        const currentStatus = useWalletStore.getState().connectionStatus[type];

        // Skip if state hasn't changed
        if (currentStatus?.state === state) {
          return;
        }

        console.log('[WalletStore] State change:', { type, state });

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

        // Update intermediate states
        if (state === 'connecting' || state === 'signing' || state === 'deriving') {
          useWalletStore.setState(prev => ({
            connectionStatus: {
              ...prev.connectionStatus,
              [type]: { state },
            },
          }));
        }
      } catch (error) {
        console.error('[WalletStore] State change handler error:', error);
      }
    });

    listenerInitialized = true;
    console.log('[WalletStore] Listener initialized successfully');
  } catch (error) {
    console.error('[WalletStore] Listener init failed:', error);
  }
};

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
