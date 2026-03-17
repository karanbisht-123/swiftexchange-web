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

    // Connect a single wallet type via extension or single-namespace WalletConnect
    connectWallet: async (type, walletId) => {
      if (get().connectedWallets[type]) return;

      set(state => ({
        connectionStatus: {
          ...state.connectionStatus,
          [type]: { state: 'connecting' },
        },
      }));

      try {
        console.log(`[WalletStore] Attempting to connect ${type} wallet: ${walletId}`);

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

        // Keep modal open if EVM connected but dYdX not yet derived
        const keepModalOpen = type === 'evm' && !session.dydxAddress;

        console.log(`[WalletStore] Successfully connected ${type} wallet: ${walletId}`);

        set(state => ({
          connectedWallets: { ...state.connectedWallets, [type]: wallet },
          connectionStatus: {
            ...state.connectionStatus,
            [type]: { state: 'connected' },
          },
          isModalOpen: keepModalOpen,
        }));
      } catch (error: any) {
        console.error(`[WalletStore] Failed to connect ${type} wallet: ${walletId}`, {
          message: error.message,
          stack: error.stack,
        });
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

    // Connect EVM (required) + Stellar (optional) in a single WalletConnect session.
    // Updates whichever wallet types were returned by the wallet.
    connectUnified: async walletId => {
      set(state => ({
        connectionStatus: {
          ...state.connectionStatus,
          evm: { state: 'connecting' },
        },
      }));

      try {
        console.log(`[WalletStore] Attempting to connect multichain connection: ${walletId}`);
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

        console.log(`[WalletStore] Multichain connection completed. Got EVM: ${!!result.evm}, Stellar: ${!!result.stellar}`);

        set(state => ({
          connectedWallets: { ...state.connectedWallets, ...walletUpdates },
          connectionStatus: { ...state.connectionStatus, ...statusUpdates },
          isModalOpen: keepModalOpen,
        }));
      } catch (error: any) {
        console.error(`[WalletStore] Failed multichain connection for ${walletId}:`, {
          message: error.message,
          stack: error.stack,
        });
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
        console.log('[WalletStore] Initiating dYdX derivation...');

        const dydx = await walletService.deriveDydx();

        console.log('[WalletStore] Successfully derived dYdX address');

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
        console.error('[WalletStore] Failed to derive dYdX address:', {
          message: error.message,
          stack: error.stack,
        });
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
      listenerInitialized = false;
    },

    restoreSessions: async () => {
      if (get().isRestoringSession) return;
      set({ isRestoringSession: true });

      try {
        console.log('[WalletStore] Initializing session restoration');

        const sessions = await walletService.restoreSessions();

        if (!sessions.length) {
          console.log('[WalletStore] No sessions restored');
          set({ isRestoringSession: false });
          return;
        }

        console.log(`[WalletStore] Restored ${sessions.length} sessions`);

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
        console.error('[WalletStore] Failed to restore sessions:', {
          message: error.message,
          stack: error.stack,
        });
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

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

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