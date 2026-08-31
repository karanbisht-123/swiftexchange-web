import { useCallback, useEffect } from 'react';

import type { Wallet } from 'ethers';
import { create } from 'zustand';

import {
  deriveHyperliquidAgentKey,
  encryptAndStoreAgentKey,
  getStoredAgentAddress,
  hasStoredAgentKey,
  purgeAgentKey,
  restoreAgentWallet,
} from '../../../../walletconnect/services/hyperliquidAgentKeyManager';
import { walletService } from '../../../../walletconnect/services/walletService';
import { useWalletStore } from '../../../../walletconnect/store/walletConnectStore';

export type DeriveState = 'idle' | 'signing' | 'ready' | 'error';

interface HyperliquidAgentStoreState {
  hyperliquidSigner: Wallet | null;
  agentAddress: string | null;
  deriveState: DeriveState;
  error: Error | null;
  isRestoring: boolean;
  setHyperliquidSigner: (signer: Wallet | null, address?: string | null) => void;
  setDeriveState: (state: DeriveState) => void;
  setError: (error: Error | null) => void;
  deriveAgentKey: (userAddr: string) => Promise<{ agentAddress: string; wallet: Wallet }>;
  restoreKey: () => Promise<Wallet | null>;
  purge: () => void;
}

export const useHyperliquidAgentStore = create<HyperliquidAgentStoreState>((set, get) => ({
  hyperliquidSigner: null,
  agentAddress: getStoredAgentAddress(),
  deriveState: hasStoredAgentKey() ? 'ready' : 'idle',
  error: null,
  isRestoring: false,

  setHyperliquidSigner: (signer, address) =>
    set({
      hyperliquidSigner: signer,
      agentAddress: address ?? (signer ? signer.address : null),
      deriveState: signer ? 'ready' : 'idle',
    }),

  setDeriveState: deriveState => set({ deriveState }),
  setError: error => set({ error }),

  restoreKey: async () => {
    if (!hasStoredAgentKey()) {
      set({ hyperliquidSigner: null, agentAddress: null, deriveState: 'idle' });
      return null;
    }

    const current = get().hyperliquidSigner;
    if (current) return current;

    if (get().isRestoring) return null;

    set({ isRestoring: true });
    try {
      const wallet = await restoreAgentWallet();
      if (wallet) {
        set({
          hyperliquidSigner: wallet,
          agentAddress: wallet.address,
          deriveState: 'ready',
          isRestoring: false,
          error: null,
        });
        return wallet;
      }
    } catch (e) {
      console.error('[HyperliquidAgentStore] Failed to restore agent wallet:', e);
    }
    set({ isRestoring: false });
    return null;
  },

  deriveAgentKey: async (userAddr: string) => {
    if (!userAddr) throw new Error('EVM wallet not connected');
    if (get().deriveState === 'signing') {
      throw new Error('Derivation request is already in progress. Please check your wallet.');
    }

    set({ deriveState: 'signing', error: null });

    try {
      const provider =
        walletService.getProvider('evm') ||
        (typeof window !== 'undefined' ? (window as any).ethereum : null);
      if (!provider) throw new Error('EVM provider not available');

      const result = await deriveHyperliquidAgentKey(userAddr, provider);
      await encryptAndStoreAgentKey(result.wallet.privateKey);

      set({
        hyperliquidSigner: result.wallet,
        agentAddress: result.agentAddress,
        deriveState: 'ready',
        error: null,
      });
      return result;
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      set({ error: err, deriveState: 'error' });
      throw err;
    }
  },

  purge: () => {
    purgeAgentKey();
    set({
      hyperliquidSigner: null,
      agentAddress: null,
      deriveState: 'idle',
      error: null,
      isRestoring: false,
    });
  },
}));

export interface UseHyperliquidAgentResult {
  hyperliquidSigner: Wallet | null;
  userAddr: string | null;
  agentAddress: string | null;
  deriveState: DeriveState;
  error: Error | null;
  deriveAgentKey: () => Promise<void>;
  purge: () => void;
  isReady: boolean;
}

export function useHyperliquidAgent(): UseHyperliquidAgentResult {
  const evmWallet = useWalletStore(state => state.connectedWallets.evm);
  const userAddr = evmWallet?.address ?? null;

  const hyperliquidSigner = useHyperliquidAgentStore(s => s.hyperliquidSigner);
  const agentAddress = useHyperliquidAgentStore(s => s.agentAddress);
  const deriveState = useHyperliquidAgentStore(s => s.deriveState);
  const error = useHyperliquidAgentStore(s => s.error);

  const restoreKey = useHyperliquidAgentStore(s => s.restoreKey);
  const deriveAgentKeyStore = useHyperliquidAgentStore(s => s.deriveAgentKey);
  const purgeStore = useHyperliquidAgentStore(s => s.purge);

  useEffect(() => {
    if (userAddr) {
      if (!hyperliquidSigner && hasStoredAgentKey()) {
        restoreKey();
      }
    } else {
      if (hyperliquidSigner) {
        purgeStore();
      }
    }
  }, [userAddr, hyperliquidSigner, restoreKey, purgeStore]);

  const deriveAgentKey = useCallback(async () => {
    if (!userAddr) throw new Error('EVM wallet not connected');
    await deriveAgentKeyStore(userAddr);
  }, [userAddr, deriveAgentKeyStore]);

  const isReady = (deriveState === 'ready' || hasStoredAgentKey()) && !!hyperliquidSigner;

  return {
    hyperliquidSigner,
    userAddr,
    agentAddress,
    deriveState,
    error,
    deriveAgentKey,
    purge: purgeStore,
    isReady,
  };
}
