import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

import { getFingerprint, prewarmFingerprint } from '../../../utils/fingerprint';
import { type NetworkType } from '../config/chains';
import {
  buildSiweMessage,
  buildStellarChallenge,
  clearAccessToken,
  getCurrentTokenInfo,
  logoutServer,
  restoreAuthSession,
  setAccessToken,
  verifySiwe,
  verifyStellarChallenge,
} from '../services/Siweauthservice';
import type { ApiTradingKey } from '../services/apiTradingKeyService';
import { WITHDRAW_PREF_KEY } from '../services/apiTradingKeyService';
import { walletService } from '../services/walletService';
import { usePortfolioStore } from '../store/portfolioStore';
import { extractErrorMessage } from '../utils/walletErrorHandler';

export const TRADING_AUTH_PREF_KEY = '_sx_trading_auth_pref';

export type WalletType = 'evm' | 'cosmos' | 'stellar';

type ConnectionState =
  'idle' | 'connecting' | 'connected' | 'signing' | 'deriving' | 'failed' | 'disconnected';

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
  session: any;

  isAuthenticated: boolean;
  isAuthenticating: boolean;
  authError: string | null;
  authenticatedChain: 'evm' | 'stellar' | null;
  linkedChains: ('evm' | 'stellar')[];
  tradingAuthEnabled: boolean;

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

  authenticateEvm: () => Promise<void>;
  authenticateStellar: () => Promise<void>;
  logoutAuth: () => Promise<void>;
  setTradingAuthEnabled: (value: boolean) => void;

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

const getInitialTradingAuth = (): boolean => {
  if (typeof window === 'undefined') return true;
  try {
    return localStorage.getItem(TRADING_AUTH_PREF_KEY) !== '0';
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

    isAuthenticated: false,
    isAuthenticating: false,
    authError: null,
    authenticatedChain: null,
    linkedChains: [],
    tradingAuthEnabled: getInitialTradingAuth(),

    apiTradingKeys: [],
    isGeneratingApiKey: false,
    revokingKeyId: null,
    apiKeyError: null,
    isApiKeyModalOpen: false,
    restrictWithdrawalToWebsite: getInitialRestrictWithdrawal(),
    isExportPhraseModalOpen: false,

    connectWallet: async (type, walletId) => {
      if (get().connectedWallets[type] || get().isConnecting(type)) return;

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
            : await walletService.connectChainWallet(walletId, type);

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

        const rawSession = walletService.getProvider(type)?.session || null;

        set(state => ({
          connectedWallets: { ...state.connectedWallets, [type]: wallet },
          connectionStatus: {
            ...state.connectionStatus,
            [type]: { state: 'connected' },
          },
          session: rawSession,
        }));

        if (type === 'evm') {
          get().authenticateEvm();
        } else if (type === 'stellar') {
          get().authenticateStellar();
        }
      } catch (error: any) {
        set(state => ({
          connectionStatus: {
            ...state.connectionStatus,
            [type]: {
              state: 'failed',
              error: extractErrorMessage(error),
            },
          },
        }));
        throw error;
      }
    },

    connectUnified: async walletId => {
      if (get().isConnecting('evm') || get().isConnecting('stellar')) return;
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

        const rawSession =
          walletService.getProvider('evm')?.session ||
          walletService.getProvider('stellar')?.session ||
          null;

        set(state => ({
          connectedWallets: { ...state.connectedWallets, ...walletUpdates },
          connectionStatus: { ...state.connectionStatus, ...statusUpdates },
          session: rawSession,
        }));

        if (result.evm) {
          get().authenticateEvm();
        }
        if (result.stellar) {
          get().authenticateStellar();
        }
      } catch (error: any) {
        set(state => ({
          connectionStatus: {
            ...state.connectionStatus,
            evm: {
              state: 'failed',
              error: extractErrorMessage(error),
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

    authenticateEvm: async () => {
      const evm = get().connectedWallets.evm;
      if (!evm) {
        return;
      }
      if (get().isAuthenticating) {
        return;
      }

      set({ isAuthenticating: true, authError: null });

      try {
        // 1. Check if we already have a valid session in DB/storage for this address
        const existingSession = await restoreAuthSession(evm.address);
        if (existingSession) {
          const hasStellar = Boolean(get().connectedWallets.stellar);
          const linked: ('evm' | 'stellar')[] = hasStellar ? ['evm', 'stellar'] : ['evm'];

          set({
            isAuthenticated: true,
            isAuthenticating: false,
            authError: null,
            authenticatedChain: 'evm',
            linkedChains: linked,
          });
          return;
        }

        // 2. Otherwise request signature from wallet
        const provider = walletService.getProvider('evm');
        if (!provider) {
          throw new Error('EVM provider not found');
        }

        const chainId =
          typeof evm.chainId === 'number' ? evm.chainId : parseInt(String(evm.chainId), 10);

        const message = await buildSiweMessage(evm.address, chainId);
        const signature = await walletService.signSiweMessage(evm.address, provider, message);

        const fingerprint = await getFingerprint();
        if (!fingerprint) {
          throw new Error(
            'Unable to verify device securely. Please disable ad blockers or privacy extensions and try again.'
          );
        }

        const { accessToken, expiresIn, refreshToken } = await verifySiwe(message, signature, {
          address: evm.address,
          chainId,
          asLink: false,
          fingerprint,
        });

        await setAccessToken(
          {
            accessToken,
            expiresAt: Date.now() + expiresIn * 1000,
            refreshToken,
            address: evm.address,
            chainId,
          },
          evm.address
        );

        const hasStellar = Boolean(get().connectedWallets.stellar);
        const linked: ('evm' | 'stellar')[] = hasStellar ? ['evm', 'stellar'] : ['evm'];

        set({
          isAuthenticated: true,
          isAuthenticating: false,
          authError: null,
          authenticatedChain: 'evm',
          linkedChains: linked,
        });
      } catch (error: any) {
        set(state => ({
          isAuthenticating: false,
          isAuthenticated: state.isAuthenticated,
          authError:
            error?.message === 'USER_REJECTED' ? 'Signature rejected' : extractErrorMessage(error),
        }));
      }
    },

    authenticateStellar: async () => {
      const state = get();
      if (state.isAuthenticating) return;

      set({ isAuthenticating: true, authError: null });

      try {
        const stellar = state.connectedWallets.stellar;

        // 1. If already have an active valid session for this address, skip
        const currentToken = getCurrentTokenInfo();
        if (
          currentToken &&
          stellar &&
          currentToken.address?.toLowerCase() === stellar.address.toLowerCase()
        ) {
          const hasEvm = Boolean(state.connectedWallets.evm);
          const linked: ('evm' | 'stellar')[] = hasEvm ? ['evm', 'stellar'] : ['stellar'];
          set({
            isAuthenticated: true,
            isAuthenticating: false,
            authError: null,
            authenticatedChain: 'stellar',
            linkedChains: linked,
          });
          return;
        }

        if (!stellar) {
          throw new Error('Stellar wallet not connected');
        }

        const provider = walletService.getProvider('stellar');
        if (!provider) {
          throw new Error('Stellar provider not found');
        }

        const { xdr, networkPassphrase } = await buildStellarChallenge(stellar.address);
        const signedXdr = await walletService.signStellarChallenge(
          xdr,
          networkPassphrase,
          provider
        );

        const { accessToken, expiresIn, refreshToken } = await verifyStellarChallenge(
          signedXdr,
          networkPassphrase,
          {
            address: stellar.address,
            chainId: stellar.chainId ? Number(stellar.chainId) : undefined,
          }
        );

        await setAccessToken(
          {
            accessToken,
            expiresAt: Date.now() + expiresIn * 1000,
            refreshToken,
            address: stellar.address,
            chainId: stellar.chainId ? Number(stellar.chainId) : undefined,
          },
          stellar.address
        );

        const hasEvm = Boolean(get().connectedWallets.evm);
        const linked: ('evm' | 'stellar')[] = hasEvm ? ['evm', 'stellar'] : ['stellar'];

        set({
          isAuthenticated: true,
          isAuthenticating: false,
          authError: null,
          authenticatedChain: 'stellar',
          linkedChains: linked,
        });
      } catch (error: any) {
        set(state => ({
          isAuthenticating: false,
          isAuthenticated: state.isAuthenticated,
          authError:
            error?.message === 'USER_REJECTED' ? 'Signature rejected' : extractErrorMessage(error),
        }));
      }
    },

    logoutAuth: async () => {
      const evmAddr = get().connectedWallets.evm?.address;
      await clearAccessToken(evmAddr);
      await logoutServer(evmAddr);
      set({ isAuthenticated: false, authenticatedChain: null, linkedChains: [] });
    },

    setTradingAuthEnabled: (value: boolean) => {
      try {
        localStorage.setItem(TRADING_AUTH_PREF_KEY, value ? '1' : '0');
      } catch (err) {
        console.error(err);
      }
      set({ tradingAuthEnabled: value });
    },

    disconnect: async type => {
      await walletService.disconnect(type);

      set(state => {
        const remainingWallets = { ...state.connectedWallets };
        delete remainingWallets[type];
        const remainingStatus = { ...state.connectionStatus };
        delete remainingStatus[type];
        const remainingPings = { ...state.sessionLastPingAt };
        delete remainingPings[type];

        const hasWallets = Object.keys(remainingWallets).length > 0;
        const nextRawSession = hasWallets
          ? walletService.getProvider('evm')?.session ||
            walletService.getProvider('cosmos')?.session ||
            walletService.getProvider('stellar')?.session ||
            null
          : null;
        return {
          connectedWallets: remainingWallets,
          connectionStatus: remainingStatus,
          sessionLastPingAt: remainingPings,
          session: nextRawSession,
        };
      });

      if (type === 'evm') {
        await get().logoutAuth();
      } else if (type === 'stellar') {
        set(state => ({
          linkedChains: state.linkedChains.filter(c => c !== 'stellar'),
        }));
      }

      const portfolio = usePortfolioStore.getState();
      if (Object.keys(get().connectedWallets).length === 0) {
        portfolio.clearAssets();
      } else {
        if (type === 'evm') {
          portfolio.clearAssetsByType('evm');
          portfolio.clearAssetsByType('dydx');
        } else if (type === 'stellar') {
          portfolio.clearAssetsByType('stellar');
        } else if (type === 'cosmos') {
          portfolio.clearAssetsByType('dydx');
        }
      }

      listenerInitialized = false;
    },

    disconnectAll: async () => {
      await walletService.disconnectAll();
      await get().logoutAuth();

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

        if (wallets.evm) {
          const session = await restoreAuthSession(wallets.evm.address);
          if (session) {
            const linked: ('evm' | 'stellar')[] = wallets.stellar ? ['evm', 'stellar'] : ['evm'];
            set({
              isAuthenticated: true,
              authenticatedChain: 'evm',
              linkedChains: linked,
            });
          } else {
            set({ isAuthenticated: false, authenticatedChain: null, linkedChains: [] });
          }
        } else {
          set({ isAuthenticated: false, authenticatedChain: null, linkedChains: [] });
        }
      } catch {
        set({ isRestoringSession: false });
      }
    },

    setNetwork: async network => {
      if (network === get().network) return;
      await walletService.setNetwork(network);
      usePortfolioStore.getState().clearAssets();
      await get().logoutAuth();
      set({
        network,
        connectedWallets: {},
        connectionStatus: {},
      });
    },

    openModal: () => {
      prewarmFingerprint();
      set({ isModalOpen: true });
    },
    closeModal: () => set({ isModalOpen: false, isAuthenticating: false }),

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
      } catch (err) {
        console.error(err);
      }
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
            const remainingWallets = { ...prev.connectedWallets };
            delete remainingWallets[type];
            const remainingStatus = { ...prev.connectionStatus };
            delete remainingStatus[type];
            const remainingPings = { ...prev.sessionLastPingAt };
            delete remainingPings[type];

            const hasWallets = Object.keys(remainingWallets).length > 0;
            const nextRawSession = hasWallets
              ? walletService.getProvider('evm')?.session ||
                walletService.getProvider('cosmos')?.session ||
                walletService.getProvider('stellar')?.session ||
                null
              : null;
            return {
              connectedWallets: remainingWallets,
              connectionStatus: remainingStatus,
              sessionLastPingAt: remainingPings,
              session: nextRawSession,
            };
          });

          const portfolio = usePortfolioStore.getState();
          const remainingWallets = useWalletStore.getState().connectedWallets;
          if (Object.keys(remainingWallets).length === 0) {
            portfolio.clearAssets();
          } else {
            if (type === 'evm') {
              portfolio.clearAssetsByType('evm');
              portfolio.clearAssetsByType('dydx');
            } else if (type === 'stellar') {
              portfolio.clearAssetsByType('stellar');
            } else if (type === 'cosmos') {
              portfolio.clearAssetsByType('dydx');
            }
          }

          if (type === 'evm') {
            void useWalletStore.getState().logoutAuth();
          } else if (type === 'stellar') {
            useWalletStore.setState(prev => ({
              linkedChains: prev.linkedChains.filter(c => c !== 'stellar'),
            }));
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
        console.error(error);
      }
    });

    listenerInitialized = true;
  } catch (error: any) {
    console.error(error);
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
