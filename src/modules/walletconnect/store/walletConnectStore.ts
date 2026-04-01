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
import { walletService } from '../services/walletService';
import { usePortfolioStore } from '../store/portfolioStore';

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
  sessionLastPingAt: Partial<Record<WalletType, number>>;
}

interface WalletActions {
  connectWallet: (type: WalletType, walletId: string) => Promise<void>;
  connectUnified: (walletId: string) => Promise<void>;
  deriveDydx: () => Promise<void>;
  disconnect: (type: WalletType) => Promise<void>;
  restoreSessions: () => Promise<void>;
  checkSessionHealth: () => Promise<{ type: WalletType; valid: boolean }[]>;
  openModal: () => void;
  closeModal: () => void;
  setNetwork: (network: NetworkType) => Promise<void>;
  isConnected: (type: WalletType) => boolean;
  isConnecting: (type: WalletType) => boolean;
  updateSessionPing: (type: WalletType) => void;
}

const getInitialNetwork = (): NetworkType => {
  if (typeof window === 'undefined') return 'mainnet';
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
    sessionLastPingAt: {},

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
            : await walletService.connectChainWallet(walletId, type, false);

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
        };

        const keepModalOpen = type === 'evm' && !session.dydxAddress;

        set(state => ({
          connectedWallets: { ...state.connectedWallets, [type]: wallet },
          connectionStatus: {
            ...state.connectionStatus,
            [type]: { state: 'connected' },
          },
          isModalOpen: keepModalOpen,
        }));
      } catch (error: any) {
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

    connectUnified: async walletId => {
      set(state => ({
        connectionStatus: {
          ...state.connectionStatus,
          evm: { state: 'connecting' },
        },
      }));

      try {
        const result = await walletService.connectUnified(walletId);

        const walletUpdates: Partial<Record<WalletType, ConnectedWallet>> = {};
        const statusUpdates: Partial<Record<WalletType, WalletConnectionStatus>> = {};

        if (result.evm) {
          walletUpdates.evm = {
            type: 'evm',
            walletId,
            address: result.evm.evmAddress!,
            chainId: result.evm.evmChainId,
            dydxAddress: result.evm.dydxAddress,
          };
          statusUpdates.evm = { state: 'connected' };
        }

        if (result.stellar) {
          walletUpdates.stellar = {
            type: 'stellar',
            walletId,
            address: result.stellar.stellarAddress!,
            chainId: result.stellar.stellarChainId,
          };
          statusUpdates.stellar = { state: 'connected' };
        }

        const keepModalOpen = !!result.evm && !result.evm.dydxAddress;

        set(state => ({
          connectedWallets: { ...state.connectedWallets, ...walletUpdates },
          connectionStatus: { ...state.connectionStatus, ...statusUpdates },
          isModalOpen: keepModalOpen,
        }));
      } catch (error: any) {
        set(state => ({
          connectionStatus: {
            ...state.connectionStatus,
            evm: {
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
            evm: { ...state.connectedWallets.evm!, dydxAddress: dydx.address },
          },
          connectionStatus: {
            ...state.connectionStatus,
            evm: { state: 'connected' },
          },
          isModalOpen: false,
        }));
      } catch (error: any) {
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
        const { [type]: _wallet, ...remainingWallets } = state.connectedWallets;
        const { [type]: _status, ...remainingStatus } = state.connectionStatus;
        const { [type]: _ping, ...remainingPings } = state.sessionLastPingAt;
        return {
          connectedWallets: remainingWallets,
          connectionStatus: remainingStatus,
          sessionLastPingAt: remainingPings,
        };
      });

      if (type === 'evm') {
        usePortfolioStore.getState().clearAssetsByType('evm');
      } else if (type === 'stellar') {
        usePortfolioStore.getState().clearAssetsByType('stellar');
      }

      listenerInitialized = false;
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

        set({ connectedWallets: wallets, connectionStatus: status, isRestoringSession: false });
      } catch (error: any) {
        set({ isRestoringSession: false });
      }
    },

    setNetwork: async network => {
      if (network === get().network) return;
      await walletService.setNetwork(network);
      usePortfolioStore.getState().clearAssets();
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
      ['connecting', 'signing', 'deriving'].includes(get().connectionStatus[type]?.state ?? ''),

    updateSessionPing: (type: WalletType) => {
      set(state => ({
        sessionLastPingAt: { ...state.sessionLastPingAt, [type]: Date.now() },
      }));
    },

    checkSessionHealth: async () => {
      return walletService.checkSessionHealth();
    },
  }))
);

let listenerInitialized = false;

export const initWalletListener = async () => {
  if (listenerInitialized) return;

  try {
    walletService.onStateChange((type, state) => {
      try {
        if (state === 'disconnected' || state === 'failed') {
          useWalletStore.setState(prev => {
            const { [type]: _wallet, ...remainingWallets } = prev.connectedWallets;
            const { [type]: _status, ...remainingStatus } = prev.connectionStatus;
            const { [type]: _ping, ...remainingPings } = prev.sessionLastPingAt;
            return {
              connectedWallets: remainingWallets,
              connectionStatus: remainingStatus,
              sessionLastPingAt: remainingPings,
            };
          });

          if (type === 'evm') {
            usePortfolioStore.getState().clearAssetsByType('evm');
          } else if (type === 'stellar') {
            usePortfolioStore.getState().clearAssetsByType('stellar');
          }

          return;
        }

        if (state === 'connecting' || state === 'signing' || state === 'deriving') {
          useWalletStore.setState(prev => ({
            connectionStatus: { ...prev.connectionStatus, [type]: { state } },
          }));
          return;
        }

        if (state === 'connected') {
          const session = walletService.getSession(type);
          if (!session) return;

          const updatedWallet: ConnectedWallet = {
            type,
            walletId: session.walletId,
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
          };

          const pingAt = walletService.getLastPingAt(type);

          useWalletStore.setState(prev => ({
            connectedWallets: { ...prev.connectedWallets, [type]: updatedWallet },
            connectionStatus: { ...prev.connectionStatus, [type]: { state: 'connected' } },
            ...(pingAt !== null
              ? { sessionLastPingAt: { ...prev.sessionLastPingAt, [type]: pingAt } }
              : {}),
          }));
        }
      } catch (error: any) {
        console.error(`[WalletStore] State change handler error for ${type}:`, {
          message: error.message,
          stack: error.stack,
        });
      }
    });

    listenerInitialized = true;
  } catch (error: any) {
    console.error('[WalletStore] Failed to initialize wallet listener:', {
      message: error.message,
      stack: error.stack,
    });
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
    return { address: evm.dydxAddress, ethAddress: evm.address };
  }
  if (cosmos?.dydxAddress) {
    return { address: cosmos.dydxAddress, cosmosAddress: cosmos.address };
  }
  return null;
};

export const selectHasDydxWallet = (state: WalletState) => {
  const evm = state.connectedWallets.evm;
  const cosmos = state.connectedWallets.cosmos;
  return Boolean(evm?.dydxAddress ?? cosmos?.dydxAddress);
};