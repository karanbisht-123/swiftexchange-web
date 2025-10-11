import { create } from 'zustand';

import { SecurityUtils } from '../../../utils/SecurityUtils';

interface DemoWallet {
  name: string;
  evmAddress: string;
  evmPrivateKey: string;
  stellarPublicKey: string;
  stellarPrivateKey: string;
  mnemonic: string;
}

interface WalletSession {
  id: string;
  walletId: string;
  addresses: string[];
  timestamp: number;
  expiresAt: number;
  isValid: () => boolean;
  refresh: () => void;
}

interface WalletState {
  isConnected: boolean;
  setIsConnected: (status: boolean) => void;
  walletAddresses: string[];
  setWalletAddresses: (addresses: string[]) => void;
  session: WalletSession | null;
  setSession: (session: WalletSession | null) => void;
  connectMultiChainWallet: () => Promise<void>;
  disconnectWallet: () => void;
  getPrivateKey: (chain: 'evm' | 'stellar') => Promise<string | null>;
  isSessionValid: () => boolean;
  refreshSession: () => void;
}

const DEMO_WALLET: DemoWallet = {
  name: import.meta.env.VITE_DEMO_WALLET_NAME,
  evmAddress: import.meta.env.VITE_DEMO_WALLET_EVM_ADDRESS,
  evmPrivateKey: import.meta.env.VITE_DEMO_WALLET_EVM_PRIVATE_KEY,
  stellarPublicKey: import.meta.env.VITE_DEMO_WALLET_STELLAR_PUBLIC_KEY,
  stellarPrivateKey: import.meta.env.VITE_DEMO_WALLET_STELLAR_PRIVATE_KEY,
  mnemonic: import.meta.env.VITE_DEMO_WALLET_MNEMONIC,
};

const SESSION_DURATION = 15 * 60 * 1000;

if (!SecurityUtils.validateWalletData(DEMO_WALLET)) {
  console.error('Demo wallet data validation failed');
}

export const useWalletStore = create<WalletState>()((set, get) => ({
  isConnected: false,
  setIsConnected: (status: boolean) => set({ isConnected: status }),
  walletAddresses: [],
  setWalletAddresses: (addresses: string[]) => set({ walletAddresses: addresses }),
  session: null,
  setSession: (session: WalletSession | null) => set({ session }),
  connectMultiChainWallet: async () => {
    try {
      const sessionToken = SecurityUtils.generateSecureSessionId();
      const walletId = await SecurityUtils.hashData(
        DEMO_WALLET.evmAddress + DEMO_WALLET.stellarPublicKey
      );

      await SecurityUtils.storeSensitiveData(`wallet_${walletId}`, DEMO_WALLET);

      const addresses = [DEMO_WALLET.evmAddress, DEMO_WALLET.stellarPublicKey];
      const secureSession = SecurityUtils.createSecureSession(SESSION_DURATION);

      const session: WalletSession = {
        id: sessionToken,
        walletId,
        addresses,
        timestamp: Date.now(),
        expiresAt: secureSession.expiresAt,
        isValid: secureSession.isValid,
        refresh: () => {
          secureSession.refresh();
          set(state => ({
            session: state.session
              ? { ...state.session, expiresAt: secureSession.expiresAt }
              : null,
          }));
        },
      };

      set({ session, isConnected: true, walletAddresses: addresses });
      console.info('Multi-chain demo wallet connected successfully', {
        sessionId: sessionToken,
        addresses,
        expiresAt: new Date(session.expiresAt).toISOString(),
      });
    } catch (error) {
      console.error('Failed to connect multi-chain wallet:', error);
      throw new Error('Wallet connection failed');
    }
  },
  disconnectWallet: () => {
    const currentSession = get().session;
    if (currentSession) {
      SecurityUtils.removeSensitiveData(`wallet_${currentSession.walletId}`);
      console.info('Multi-chain wallet disconnected', {
        sessionId: currentSession.id,
        duration: Date.now() - currentSession.timestamp,
      });
    }
    set({ isConnected: false, walletAddresses: [], session: null });
  },
  getPrivateKey: async (chain: 'evm' | 'stellar') => {
    const session = get().session;
    if (!session || !session.isValid()) {
      console.warn('Attempted to access private key without valid session');
      return null;
    }
    try {
      const walletData = SecurityUtils.getSensitiveData(`wallet_${session.walletId}`);
      if (!walletData) {
        console.error('Wallet data not found in secure storage');
        return null;
      }
      const privateKey = chain === 'evm' ? walletData.evmPrivateKey : walletData.stellarPrivateKey;
      console.info(`Private key accessed for ${chain} chain`, {
        sessionId: session.id,
        keyMask: SecurityUtils.maskSensitiveData(privateKey),
      });
      return privateKey;
    } catch (error) {
      console.error(`Failed to retrieve ${chain} private key:`, error);
      return null;
    }
  },
  isSessionValid: () => {
    const session = get().session;
    if (!session) return false;
    if (!session.isValid()) {
      console.info('Session expired, auto-disconnecting wallet');
      get().disconnectWallet();
      return false;
    }
    return true;
  },
  refreshSession: () => {
    const session = get().session;
    if (!session || !session.isValid()) return;
    session.refresh();
    console.debug('Session refreshed', {
      sessionId: session.id,
      newExpiry: new Date(session.expiresAt).toISOString(),
    });
  },
}));
