import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

import {
  type NetworkType,
} from '../config/chains';
import { walletService } from '../services/walletService';
import { usePortfolioStore } from '../store/portfolioStore';
import type { ApiTradingKey } from '../services/apiTradingKeyService';
import { WITHDRAW_PREF_KEY } from '../services/apiTradingKeyService';
// import { ErrorCode } from '@allbridge/bridge-core-sdk';

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
  peerName?: string;
  peerIcon?: string;
  peerRedirect?: { native?: string; universal?: string; linkMode?: boolean };
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
  isRestoringSession: boolean;
  sessionLastPingAt: Partial<Record<WalletType, number>>;
  session: any; // Raw WalletConnect session if connected

  // API Trading Keys 
  apiTradingKeys: ApiTradingKey[];
  isGeneratingApiKey: boolean;
  revokingKeyId: string | null;
  apiKeyError: string | null;
  isApiKeyModalOpen: boolean;
  restrictWithdrawalToWebsite: boolean;
  isExportPhraseModalOpen: boolean;
}

interface WalletActions {
  connectWallet: (type: WalletType, walletId: string) => Promise<void>;
  connectUnified: (walletId: string) => Promise<void>;
  deriveDydx: () => Promise<void>;
  disconnect: (type: WalletType) => Promise<void>;
  disconnectAll: () => Promise<void>;
  restoreSessions: () => Promise<void>;
  checkSessionHealth: () => Promise<{ type: WalletType; valid: boolean }[]>;
  openModal: () => void;
  closeModal: () => void;
  setNetwork: (network: NetworkType) => Promise<void>;
  isConnected: (type: WalletType) => boolean;
  isConnecting: (type: WalletType) => boolean;
  updateSessionPing: (type: WalletType) => void;

  // API Trading Keys 
  generateApiTradingKey: (label?: string) => Promise<void>;
  revokeApiTradingKey: (id: string) => Promise<void>;
  loadApiTradingKeys: () => void;
  openApiKeyModal: () => void;
  closeApiKeyModal: () => void;
  setRestrictWithdrawalToWebsite: (value: boolean) => void;
  openExportPhraseModal: () => void;
  closeExportPhraseModal: () => void;
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

const getInitialRestrictWithdrawal = (): boolean => {
  if (typeof window === 'undefined') return true;
  try {
    return localStorage.getItem(WITHDRAW_PREF_KEY) !== '0';
  } catch {
    return true;
  }
};

export const useWalletStore = create<WalletState & WalletActions>()(
  subscribeWithSelector((set, get) => ({
    connectedWallets: {},
    connectionStatus: {},
    isModalOpen: false,
    network: initialNetwork,
    isRestoringSession: false,
    sessionLastPingAt: {},
    session: null,

    // API Trading Keys initial state
    apiTradingKeys: [],
    isGeneratingApiKey: false,
    revokingKeyId: null,
    apiKeyError: null,
    isApiKeyModalOpen: false,
    restrictWithdrawalToWebsite: getInitialRestrictWithdrawal(),
    isExportPhraseModalOpen: false,

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
          peerName: session.peerName,
          peerIcon: session.peerIcon,
          peerRedirect: session.peerRedirect,
        };

        const keepModalOpen = type === 'evm' && !session.dydxAddress;

        const rawSession = walletService.getProvider(type)?.session || null;

        set(state => ({
          connectedWallets: { ...state.connectedWallets, [type]: wallet },
          connectionStatus: {
            ...state.connectionStatus,
            [type]: { state: 'connected' },
          },
          isModalOpen: keepModalOpen,
          session: rawSession,
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
            peerName: result.evm.peerName,
            peerIcon: result.evm.peerIcon,
            peerRedirect: result.evm.peerRedirect,
          };
          statusUpdates.evm = { state: 'connected' };
        }

        if (result.stellar) {
          walletUpdates.stellar = {
            type: 'stellar',
            walletId,
            address: result.stellar.stellarAddress!,
            chainId: result.stellar.stellarChainId,
            peerName: result.stellar.peerName,
            peerIcon: result.stellar.peerIcon,
            peerRedirect: result.stellar.peerRedirect,
          };
          statusUpdates.stellar = { state: 'connected' };
        }

        const keepModalOpen = !!result.evm && !result.evm.dydxAddress;

        const rawSession =
          walletService.getProvider('evm')?.session ||
          walletService.getProvider('stellar')?.session ||
          null;

        set(state => ({
          connectedWallets: { ...state.connectedWallets, ...walletUpdates },
          connectionStatus: { ...state.connectionStatus, ...statusUpdates },
          isModalOpen: keepModalOpen,
          session: rawSession,
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
      console.log(`[WalletStore] Disconnecting ${type}...`);
      await walletService.disconnect(type);

      set(state => {
        const { [type]: _wallet, ...remainingWallets } = state.connectedWallets;
        const { [type]: _status, ...remainingStatus } = state.connectionStatus;
        const { [type]: _ping, ...remainingPings } = state.sessionLastPingAt;
        const hasWallets = Object.keys(remainingWallets).length > 0;
        const nextRawSession = hasWallets
          ? (walletService.getProvider('evm')?.session ||
            walletService.getProvider('cosmos')?.session ||
            walletService.getProvider('stellar')?.session ||
            null)
          : null;
        return {
          connectedWallets: remainingWallets,
          connectionStatus: remainingStatus,
          sessionLastPingAt: remainingPings,
          session: nextRawSession,
        };
      });

      const portfolio = usePortfolioStore.getState();
      if (Object.keys(get().connectedWallets).length === 0) {
        portfolio.clearAssets();
      } else {
        if (type === 'evm') {
          portfolio.clearAssetsByType('evm');
          portfolio.clearAssetsByType('dydx'); // dYdX usually derived from EVM
        } else if (type === 'stellar') {
          portfolio.clearAssetsByType('stellar');
        } else if (type === 'cosmos') {
          portfolio.clearAssetsByType('dydx');
        }
      }

      listenerInitialized = false;
    },

    disconnectAll: async () => {
      console.log('[WalletStore] Disconnecting all wallets...');
      await walletService.disconnectAll();

      set({
        connectedWallets: {},
        connectionStatus: {},
        sessionLastPingAt: {},
        session: null,
      });

      usePortfolioStore.getState().clearAssets();
      listenerInitialized = false;
    },

    restoreSessions: async () => {
      if (get().isRestoringSession) return;
      set({ isRestoringSession: true });

      try {
        const sessions = await walletService.restoreSessions();

        // WC looked and found no live sessions — safe to clean up.
        if (!sessions.length) {
          set({ isRestoringSession: false });
          await get().disconnectAll();
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
            peerName: s.peerName,
            peerIcon: s.peerIcon,
            peerRedirect: s.peerRedirect,
          };
          status[s.type] = { state: 'connected' };
        });

        const rawSession =
          walletService.getProvider('evm')?.session ||
          walletService.getProvider('cosmos')?.session ||
          walletService.getProvider('stellar')?.session ||
          null;

        set({
          connectedWallets: wallets,
          connectionStatus: status,
          isRestoringSession: false,
          session: rawSession,
        });
      } catch (error: any) {
        console.error('[WalletStore] Failed to restore sessions:', {
          message: error?.message,
          stack: error?.stack,
        });
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

    // API Trading Key actions 

    loadApiTradingKeys: () => {
      set({ apiTradingKeys: walletService.listApiTradingKeys() });
    },

    generateApiTradingKey: async (label?: string) => {
      if (get().isGeneratingApiKey) return;
      set({ isGeneratingApiKey: true, apiKeyError: null });
      try {
        await walletService.generateApiTradingKey(label);
        set({ apiTradingKeys: walletService.listApiTradingKeys() });
      } catch (err: any) {
        set({ apiKeyError: err instanceof Error ? err.message : 'Failed to generate API key.' });
        throw err;
      } finally {
        set({ isGeneratingApiKey: false });
      }
    },

    revokeApiTradingKey: async (id: string) => {
      if (get().revokingKeyId) return;
      set({ revokingKeyId: id, apiKeyError: null });
      try {
        await walletService.revokeApiTradingKey(id);
        set({ apiTradingKeys: walletService.listApiTradingKeys() });
      } catch (err: any) {
        set({ apiKeyError: err instanceof Error ? err.message : 'Failed to revoke API key.' });
        throw err;
      } finally {
        set({ revokingKeyId: null });
      }
    },

    openApiKeyModal: () => set({ isApiKeyModalOpen: true, apiKeyError: null }),
    closeApiKeyModal: () => set({ isApiKeyModalOpen: false }),

    openExportPhraseModal: () => set({ isExportPhraseModalOpen: true }),
    closeExportPhraseModal: () => set({ isExportPhraseModalOpen: false }),

    setRestrictWithdrawalToWebsite: (value: boolean) => {
      try {
        localStorage.setItem(WITHDRAW_PREF_KEY, value ? '1' : '0');
      } catch (err) { console.error("--", err) }
      set({ restrictWithdrawalToWebsite: value });
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
            const hasWallets = Object.keys(remainingWallets).length > 0;
            const nextRawSession = hasWallets
              ? (walletService.getProvider('evm')?.session ||
                walletService.getProvider('cosmos')?.session ||
                walletService.getProvider('stellar')?.session ||
                null)
              : null;
            return {
              connectedWallets: remainingWallets,
              connectionStatus: remainingStatus,
              sessionLastPingAt: remainingPings,
              session: nextRawSession,
            };
          });
          // if (type === 'evm') {
          //       usePortfolioStore.getState().clearAssetsByType('evm');
          //       usePortfolioStore.getState().clearAssetsByType('dydx');
          //     } else if (type === 'stellar') {
          //       usePortfolioStore.getState().clearAssetsByType('stellar');
          //     } else if (type === 'cosmos') {
          //       usePortfolioStore.getState().clearAssetsByType('dydx');
          //     }
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
            peerName: session.peerName,
            peerIcon: session.peerIcon,
            peerRedirect: session.peerRedirect,
          };

          const pingAt = walletService.getLastPingAt(type);

          const rawSession = walletService.getProvider(type)?.session || null;

          useWalletStore.setState(prev => ({
            connectedWallets: { ...prev.connectedWallets, [type]: updatedWallet },
            connectionStatus: { ...prev.connectionStatus, [type]: { state: 'connected' } },
            session: rawSession,
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